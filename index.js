const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// إنشاء مجلدات التحميل
if (!fs.existsSync('public')) {
    fs.mkdirSync('public');
}
if (!fs.existsSync('public/uploads')) {
    fs.mkdirSync('public/uploads');
}
if (!fs.existsSync('public/profiles')) {
    fs.mkdirSync('public/profiles');
}

// إعداد قاعدة البيانات SQLite
const db = new sqlite3.Database('chat.db');

// الرتب المتاحة في النظام
const RANKS = {
    visitor: { name: 'زائر', emoji: '👋', level: 0 },
    bronze: { name: 'عضو برونزي', emoji: '🥉', level: 1 },
    silver: { name: 'عضو فضي', emoji: '🥈', level: 2 },
    gold: { name: 'عضو ذهبي', emoji: '🥇', level: 3 },
    trophy: { name: 'مالك الموقع', emoji: '🏆', level: 4 },
    diamond: { name: 'عضو الماس', emoji: '💎', level: 5 },
    prince: { name: 'برنس', emoji: '👑', level: 6 }
};

// إنشاء الجداول
db.serialize(() => {
    // جدول المستخدمين مع إضافة الرتب وصور البروفايل
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        display_name TEXT,
        role TEXT DEFAULT 'user',
        rank TEXT DEFAULT 'visitor',
        profile_image1 TEXT,
        profile_image2 TEXT,
        background_image TEXT,
        message_background TEXT,
        privacy_mode TEXT DEFAULT 'open',
        age INTEGER,
        gender TEXT,
        marital_status TEXT,
        about_me TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_online BOOLEAN DEFAULT FALSE
    )`);

    // جدول الغرف
    db.run(`CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        background_image TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users (id)
    )`);

    // جدول الرسائل
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        email TEXT,
        message TEXT NOT NULL,
        is_private BOOLEAN DEFAULT FALSE,
        receiver_id INTEGER,
        room_id INTEGER DEFAULT 1,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (receiver_id) REFERENCES users (id),
        FOREIGN KEY (room_id) REFERENCES rooms (id)
    )`);

    // إضافة عمود room_id إذا لم يكن موجوداً
    db.run(`ALTER TABLE messages ADD COLUMN room_id INTEGER DEFAULT 1`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('خطأ في إضافة عمود room_id:', err);
        }
    });

    // إضافة عمود is_deleted إذا لم يكن موجوداً
    db.run(`ALTER TABLE messages ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('خطأ في إضافة عمود is_deleted:', err);
        }
    });

    // إضافة عمود voice_url إذا لم يكن موجوداً
    db.run(`ALTER TABLE messages ADD COLUMN voice_url TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('خطأ في إضافة عمود voice_url:', err);
        }
    });

    // إضافة عمود image_url إذا لم يكن موجوداً
    db.run(`ALTER TABLE messages ADD COLUMN image_url TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('خطأ في إضافة عمود image_url:', err);
        }
    });

    // إضافة عمود coins للمستخدمين إذا لم يكن موجوداً
    db.run(`ALTER TABLE users ADD COLUMN coins INTEGER DEFAULT 2000`, (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('خطأ في إضافة عمود coins:', err);
        }
    });

    // جدول الحظر
    db.run(`CREATE TABLE IF NOT EXISTS bans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        banned_by INTEGER,
        reason TEXT NOT NULL,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (banned_by) REFERENCES users (id)
    )`);

    // جدول تاريخ النقاط
    db.run(`CREATE TABLE IF NOT EXISTS coins_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        amount INTEGER NOT NULL,
        type TEXT NOT NULL,
        reason TEXT,
        admin_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (admin_id) REFERENCES users (id)
    )`);

    // جدول الأصدقاء
    db.run(`CREATE TABLE IF NOT EXISTS friendships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        friend_id INTEGER,
        status TEXT DEFAULT 'pending',
        requested_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (friend_id) REFERENCES users (id),
        FOREIGN KEY (requested_by) REFERENCES users (id)
    )`);

    // جدول التجاهل والحظر
    db.run(`CREATE TABLE IF NOT EXISTS blocked_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        blocked_user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (blocked_user_id) REFERENCES users (id)
    )`);

    // جدول الخلفيات
    db.run(`CREATE TABLE IF NOT EXISTS backgrounds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        image_url TEXT NOT NULL,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users (id)
    )`);

    // جدول الأذونات
    db.run(`CREATE TABLE IF NOT EXISTS permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        permission TEXT NOT NULL
    )`);

    // جدول تاريخ الرتب
    db.run(`CREATE TABLE IF NOT EXISTS rank_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        old_rank TEXT,
        new_rank TEXT,
        assigned_by INTEGER,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (assigned_by) REFERENCES users (id)
    )`);

    // إدراج الأذونات الافتراضية
    db.run(`INSERT OR IGNORE INTO permissions (role, permission) VALUES 
        ('admin', 'manage_users'),
        ('admin', 'manage_backgrounds'),
        ('admin', 'delete_messages'),
        ('admin', 'change_user_roles'),
        ('admin', 'assign_ranks'),
        ('admin', 'manage_rooms'),
        ('moderator', 'delete_messages'),
        ('moderator', 'manage_backgrounds'),
        ('user', 'send_messages'),
        ('user', 'change_own_background')
    `);

    // إنشاء الغرفة الرئيسية
    db.run(`INSERT OR IGNORE INTO rooms (id, name, description, created_by) VALUES 
        (1, 'الغرفة الرئيسية', 'غرفة الدردشة العامة', 1)`);

    // إنشاء مستخدم إداري افتراضي
    const adminPassword = bcrypt.hashSync('Zxcvbnm.8', 10);
    db.run(`INSERT OR IGNORE INTO users (email, password, display_name, role, rank) VALUES 
        ('njdj9985@mail.com', ?, 'صاحب الشات', 'admin', 'prince')
    `, [adminPassword]);
});

// إعداد multer لرفع الملفات
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname.startsWith('profile')) {
            cb(null, 'public/profiles/');
        } else {
            cb(null, 'public/uploads/');
        }
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('فقط الصور والملفات الصوتية مسموحة!'), false);
        }
    }
});

// JWT Secret
const JWT_SECRET = 'your-super-secret-jwt-key-change-this-in-production';

// Middleware للتحقق من المصادقة
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.sendStatus(401);
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// APIs
// تسجيل الدخول
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
        }

        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
        }

        // تحديث حالة المستخدم إلى متصل
        db.run('UPDATE users SET is_online = TRUE WHERE id = ?', [user.id]);

        const token = jwt.sign(
            { 
                id: user.id, 
                email: user.email, 
                role: user.role,
                rank: user.rank,
                display_name: user.display_name 
            }, 
            JWT_SECRET, 
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                display_name: user.display_name,
                role: user.role,
                rank: user.rank,
                profile_image1: user.profile_image1,
                profile_image2: user.profile_image2,
                background_image: user.background_image
            }
        });
    });
});

// تسجيل مستخدم جديد
app.post('/api/register', (req, res) => {
    const { email, password, display_name } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' });
    }

    // التحقق من صيغة البريد الإلكتروني
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    db.run('INSERT INTO users (email, password, display_name, rank) VALUES (?, ?, ?, ?)', 
        [email, hashedPassword, display_name || email.split('@')[0], 'visitor'], 
        function(err) {
            if (err) {
                if (err.code === 'SQLITE_CONSTRAINT') {
                    return res.status(400).json({ error: 'البريد الإلكتروني موجود بالفعل' });
                }
                return res.status(500).json({ error: 'خطأ في التسجيل' });
            }

            const token = jwt.sign(
                { 
                    id: this.lastID, 
                    email, 
                    role: 'user',
                    rank: 'visitor',
                    display_name: display_name || email.split('@')[0] 
                }, 
                JWT_SECRET, 
                { expiresIn: '7d' }
            );

            res.json({
                token,
                user: {
                    id: this.lastID,
                    email,
                    display_name: display_name || email.split('@')[0],
                    role: 'user',
                    rank: 'visitor'
                }
            });
        }
    );
});

// الحصول على رسائل غرفة معينة
app.get('/api/messages/:roomId', authenticateToken, (req, res) => {
    const roomId = req.params.roomId || 1;
    db.all(`SELECT m.*, u.display_name, u.role, u.rank, u.profile_image1, u.background_image, u.message_background 
            FROM messages m 
            JOIN users u ON m.user_id = u.id 
            WHERE m.is_private = FALSE AND m.room_id = ?
            ORDER BY m.timestamp DESC 
            LIMIT 100`, [roomId], (err, messages) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
        }
        res.json(messages.reverse());
    });
});

// الحصول على جميع الغرف
app.get('/api/rooms', authenticateToken, (req, res) => {
    db.all('SELECT * FROM rooms ORDER BY created_at ASC', [], (err, rooms) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
        }
        res.json(rooms);
    });
});

// إنشاء غرفة جديدة (للإداريين فقط)
app.delete('/api/rooms/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مسموح - للإداريين فقط' });
    }

    const roomId = parseInt(req.params.id);

    if (roomId === 1) {
        return res.status(400).json({ error: 'لا يمكن حذف الغرفة الرئيسية' });
    }

    db.run('DELETE FROM rooms WHERE id = ?', [roomId], (err) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في حذف الغرفة' });
        }

        // حذف رسائل الغرفة أيضاً
        db.run('DELETE FROM messages WHERE room_id = ?', [roomId], (err) => {
            if (err) {
                console.error('خطأ في حذف رسائل الغرفة:', err);
            }
        });

        res.json({ success: true, message: 'تم حذف الغرفة بنجاح' });
    });
});

// حذف رسالة
app.delete('/api/messages/:id', authenticateToken, (req, res) => {
    const messageId = parseInt(req.params.id);

    // التحقق من ملكية الرسالة أو صلاحية الإدارة
    db.get('SELECT user_id FROM messages WHERE id = ?', [messageId], (err, message) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
        }

        if (!message) {
            return res.status(404).json({ error: 'الرسالة غير موجودة' });
        }

        if (message.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'owner') {
            return res.status(403).json({ error: 'غير مسموح - يمكنك حذف رسائلك فقط' });
        }

        // استخدام soft delete بدلاً من الحذف النهائي
        db.run('UPDATE messages SET message = "[تم حذف هذه الرسالة]", is_deleted = 1 WHERE id = ?', [messageId], (err) => {
            if (err) {
                return res.status(500).json({ error: 'خطأ في حذف الرسالة' });
            }
            
            // إرسال إشعار بحذف الرسالة عبر Socket.IO
            if (req.app.get('io')) {
                req.app.get('io').emit('messageDeleted', messageId);
            }
            
            res.json({ success: true, message: 'تم حذف الرسالة بنجاح' });
        });
    });
});

// رفع الملفات الصوتية
app.post('/api/upload-voice', authenticateToken, upload.single('voice'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'لم يتم رفع ملف صوتي' });
    }

    const voice_url = `/uploads/${req.file.filename}`;
    res.json({ voice_url });
});

// رفع الصور للرسائل العامة
app.post('/upload-image', authenticateToken, upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.json({ success: false, message: 'لم يتم رفع أي صورة' });
        }
        
        const imageUrl = `/uploads/${req.file.filename}`;
        res.json({ success: true, imageUrl: imageUrl });
    } catch (error) {
        console.error('خطأ في رفع الصورة:', error);
        res.json({ success: false, message: 'حدث خطأ أثناء رفع الصورة' });
    }
});

// رفع الصور للرسائل الخاصة
app.post('/upload-private-image', authenticateToken, upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.json({ success: false, message: 'لم يتم رفع أي صورة' });
        }
        
        const imageUrl = `/uploads/${req.file.filename}`;
        res.json({ success: true, imageUrl: imageUrl });
    } catch (error) {
        console.error('خطأ في رفع الصورة الخاصة:', error);
        res.json({ success: false, message: 'حدث خطأ أثناء رفع الصورة' });
    }
});

// إزالة endpoint المكرر - تم دمجه في DELETE endpoint أعلاه

// حظر المستخدم (للإداريين فقط)
app.post('/api/ban', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'owner') {
        return res.status(403).json({ error: 'غير مسموح - للإداريين فقط' });
    }

    const { userId, reason, duration } = req.body;

    if (!userId || !reason) {
        return res.status(400).json({ error: 'معرف المستخدم وسبب الحظر مطلوبان' });
    }

    // التحقق من وجود المستخدم
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
        }

        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        // منع حظر المالك أو الإداريين
        if (user.role === 'owner' || (user.role === 'admin' && req.user.role !== 'owner')) {
            return res.status(403).json({ error: 'لا يمكن حظر هذا المستخدم' });
        }

        // حساب تاريخ انتهاء الحظر
        let banExpiresAt = null;
        if (duration !== 'permanent') {
            const hours = parseInt(duration);
            banExpiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
        }

        // إضافة الحظر أو تحديثه
        db.run(`INSERT OR REPLACE INTO bans (user_id, banned_by, reason, expires_at, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [userId, req.user.id, reason, banExpiresAt], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'خطأ في تطبيق الحظر' });
                }

                // تحديث حالة المستخدم
                db.run('UPDATE users SET is_online = FALSE WHERE id = ?', [userId]);

                res.json({ 
                    success: true, 
                    message: `تم حظر المستخدم ${user.display_name} بنجاح` 
                });
            });
    });
});

// إهداء النقاط (للإداريين فقط)
app.post('/api/give-coins', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'owner') {
        return res.status(403).json({ error: 'غير مسموح - للإداريين فقط' });
    }

    const { userId, amount, reason } = req.body;

    if (!userId || !amount || amount < 1) {
        return res.status(400).json({ error: 'معرف المستخدم وعدد النقاط مطلوبان' });
    }

    if (amount > 10000) {
        return res.status(400).json({ error: 'لا يمكن إهداء أكثر من 10000 نقطة في المرة الواحدة' });
    }

    // التحقق من وجود المستخدم
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
        }

        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        // تحديث نقاط المستخدم
        const currentCoins = user.coins || 0;
        const newCoins = currentCoins + parseInt(amount);

        db.run('UPDATE users SET coins = ? WHERE id = ?', [newCoins, userId], (err) => {
            if (err) {
                return res.status(500).json({ error: 'خطأ في تحديث النقاط' });
            }

            // إضافة سجل في تاريخ النقاط
            db.run(`INSERT INTO coins_history (user_id, amount, type, reason, admin_id, created_at) VALUES (?, ?, 'gift', ?, ?, CURRENT_TIMESTAMP)`,
                [userId, amount, reason || 'إهداء من الإدارة', req.user.id], (err) => {
                    if (err) {
                        console.error('خطأ في إضافة سجل النقاط:', err);
                    }
                });

            res.json({ 
                success: true, 
                message: `تم إهداء ${amount} نقطة لـ ${user.display_name} بنجاح`
            });
        });
    });
});

app.post('/api/rooms', authenticateToken, upload.single('roomBackground'), (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مسموح - للإداريين فقط' });
    }

    const { name, description } = req.body;
    const background_image = req.file ? `/uploads/${req.file.filename}` : null;

    if (!name) {
        return res.status(400).json({ error: 'اسم الغرفة مطلوب' });
    }

    db.run('INSERT INTO rooms (name, description, background_image, created_by) VALUES (?, ?, ?, ?)',
        [name, description, background_image, req.user.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'خطأ في إنشاء الغرفة' });
            }
            res.json({
                id: this.lastID,
                name,
                description,
                background_image,
                created_by: req.user.id
            });
        }
    );
});

// الحصول على الرسائل الخاصة
app.get('/api/private-messages/:userId', authenticateToken, (req, res) => {
    const otherUserId = req.params.userId;
    const currentUserId = req.user.id;

    db.all(`SELECT m.*, u.display_name, u.role, u.rank, u.profile_image1
            FROM messages m 
            JOIN users u ON m.user_id = u.id 
            WHERE m.is_private = TRUE 
            AND ((m.user_id = ? AND m.receiver_id = ?) OR (m.user_id = ? AND m.receiver_id = ?))
            ORDER BY m.timestamp ASC 
            LIMIT 100`, 
            [currentUserId, otherUserId, otherUserId, currentUserId], (err, messages) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
        }
        res.json(messages);
    });
});

// الحصول على المستخدمين المتصلين مع الرتب
app.get('/api/users', authenticateToken, (req, res) => {
    db.all('SELECT id, email, display_name, role, rank, profile_image1, is_online FROM users WHERE is_online = TRUE', [], (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
        }
        res.json(users);
    });
});

// الحصول على جميع المستخدمين (للإدارة)
// الحصول على جميع المستخدمين للدردشة الخاصة
app.get('/api/all-users-chat', authenticateToken, (req, res) => {
    db.all('SELECT id, display_name, email, rank, profile_image1, is_online, age, gender, marital_status, about_me FROM users ORDER BY display_name', (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
        }
        res.json(users);
    });
});

// تحديث المعلومات الشخصية
app.put('/api/user/personal-info', authenticateToken, (req, res) => {
    const { age, gender, marital_status, about_me } = req.body;

    db.run('UPDATE users SET age = ?, gender = ?, marital_status = ?, about_me = ? WHERE id = ?', 
        [age, gender, marital_status, about_me, req.user.id], (err) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في تحديث المعلومات' });
        }
        res.json({ success: true, message: 'تم تحديث المعلومات بنجاح' });
    });
});

// تجاهل/حظر مستخدم
app.post('/api/block-user', authenticateToken, (req, res) => {
    const { blockedUserId } = req.body;
    const userId = req.user.id;

    if (userId === blockedUserId) {
        return res.status(400).json({ error: 'لا يمكنك حظر نفسك' });
    }

    // التحقق من عدم وجود حظر مسبق
    db.get('SELECT * FROM blocked_users WHERE user_id = ? AND blocked_user_id = ?', 
        [userId, blockedUserId], (err, existing) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
        }

        if (existing) {
            return res.status(400).json({ error: 'المستخدم محظور بالفعل' });
        }

        db.run('INSERT INTO blocked_users (user_id, blocked_user_id) VALUES (?, ?)',
            [userId, blockedUserId], (err) => {
            if (err) {
                return res.status(500).json({ error: 'خطأ في حظر المستخدم' });
            }
            res.json({ success: true, message: 'تم حظر المستخدم' });
        });
    });
});

// إلغاء تجاهل/حظر مستخدم
app.delete('/api/unblock-user/:blockedUserId', authenticateToken, (req, res) => {
    const { blockedUserId } = req.params;
    const userId = req.user.id;

    db.run('DELETE FROM blocked_users WHERE user_id = ? AND blocked_user_id = ?',
        [userId, blockedUserId], (err) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في إلغاء الحظر' });
        }
        res.json({ success: true, message: 'تم إلغاء حظر المستخدم' });
    });
});

// الحصول على قائمة المستخدمين المحظورين
app.get('/api/blocked-users', authenticateToken, (req, res) => {
    db.all(`SELECT bu.*, u.display_name, u.profile_image1 
            FROM blocked_users bu 
            JOIN users u ON bu.blocked_user_id = u.id 
            WHERE bu.user_id = ?`, [req.user.id], (err, blockedUsers) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في جلب المستخدمين المحظورين' });
        }
        res.json(blockedUsers);
    });
});

// تغيير كلمة مرور مستخدم (للإدارة فقط)
app.put('/api/admin/change-password', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مسموح - للإداريين فقط' });
    }

    const { userId, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId], (err) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في تغيير كلمة المرور' });
        }
        res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
    });
});

// الحصول على معلومات مستخدم (للإدارة أو المستخدم نفسه)
app.get('/api/user-info/:userId', authenticateToken, (req, res) => {
    const { userId } = req.params;

    // يمكن للإدارة رؤية أي مستخدم، أو للمستخدم رؤية نفسه
    if (req.user.role !== 'admin' && req.user.id !== parseInt(userId)) {
        return res.status(403).json({ error: 'غير مسموح' });
    }

    db.get('SELECT id, email, display_name, rank, role, profile_image1, profile_image2, age, gender, marital_status, about_me, is_online, created_at FROM users WHERE id = ?', 
        [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
        }
        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }
        res.json(user);
    });
});

app.get('/api/all-users', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مسموح' });
    }

    db.all('SELECT id, email, display_name, role, rank, profile_image1, is_online, created_at FROM users ORDER BY created_at DESC', [], (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
        }
        res.json(users);
    });
});

// تعيين رتبة للمستخدم (للإدارة فقط)
app.post('/api/assign-rank', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مسموح - للإداريين فقط' });
    }

    const { userId, newRank, reason } = req.body;

    if (!RANKS[newRank]) {
        return res.status(400).json({ error: 'رتبة غير صحيحة' });
    }

    // منع تعيين رتبة البرنس لأي شخص آخر غير صاحب الشات
    if (newRank === 'prince' && req.user.email !== 'njdj9985@mail.com') {
        return res.status(403).json({ error: 'رتبة البرنس محجوزة لصاحب الشات فقط' });
    }

    // الحصول على الرتبة الحالية
    db.get('SELECT rank FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
        }

        if (!user) {
            return res.status(404).json({ error: 'المستخدم غير موجود' });
        }

        const oldRank = user.rank;

        // تحديث الرتبة
        db.run('UPDATE users SET rank = ? WHERE id = ?', [newRank, userId], (err) => {
            if (err) {
                return res.status(500).json({ error: 'خطأ في تحديث الرتبة' });
            }

            // حفظ تاريخ الرتبة
            db.run('INSERT INTO rank_history (user_id, old_rank, new_rank, assigned_by, reason) VALUES (?, ?, ?, ?, ?)',
                [userId, oldRank, newRank, req.user.id, reason], (err) => {
                if (err) {
                    console.error('خطأ في حفظ تاريخ الرتبة:', err);
                }
            });

            res.json({ 
                success: true, 
                message: `تم تعيين رتبة ${RANKS[newRank].emoji} ${RANKS[newRank].name} بنجاح` 
            });
        });
    });
});

// الحصول على الرتب المتاحة
app.get('/api/ranks', authenticateToken, (req, res) => {
    res.json(RANKS);
});

// رفع صور البروفايل (صورتين)
app.post('/api/upload-profile-images', authenticateToken, upload.fields([
    { name: 'profile1', maxCount: 1 },
    { name: 'profile2', maxCount: 1 }
]), (req, res) => {
    const userId = req.user.id;
    let updateFields = [];
    let updateValues = [];

    if (req.files.profile1) {
        updateFields.push('profile_image1 = ?');
        updateValues.push(`/profiles/${req.files.profile1[0].filename}`);
    }

    if (req.files.profile2) {
        updateFields.push('profile_image2 = ?');
        updateValues.push(`/profiles/${req.files.profile2[0].filename}`);
    }

    if (updateFields.length === 0) {
        return res.status(400).json({ error: 'لم يتم رفع أي صورة' });
    }

    updateValues.push(userId);
    const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;

    db.run(query, updateValues, (err) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في حفظ الصور' });
        }

        res.json({ 
            success: true,
            profile_image1: req.files.profile1 ? `/profiles/${req.files.profile1[0].filename}` : undefined,
            profile_image2: req.files.profile2 ? `/profiles/${req.files.profile2[0].filename}` : undefined
        });
    });
});

// الحصول على بيانات المستخدم الحالي
app.get('/api/user/profile', authenticateToken, (req, res) => {
    db.get('SELECT id, email, display_name, role, rank, profile_image1, profile_image2, background_image FROM users WHERE id = ?', 
        [req.user.id], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
        }
        res.json(user);
    });
});

// باقي APIs الموجودة...
// متغيرات لحفظ الأخبار والستوري مؤقتاً
let newsArray = [];
let storiesArray = [];
let notificationsArray = [];

// API للأخبار
app.get('/api/news', authenticateToken, (req, res) => {
    res.json(newsArray);
});

app.post('/api/news', authenticateToken, upload.single('newsFile'), (req, res) => {
    const { content } = req.body;
    if (!content && !req.file) {
        return res.status(400).json({ error: 'يجب إدخال محتوى أو ملف' });
    }

    const media = req.file ? `/uploads/${req.file.filename}` : null;
    const newNews = {
        id: newsArray.length + 1,
        content,
        media,
        display_name: req.user.displayName,
        timestamp: new Date().toISOString(),
        user_id: req.user.id
    };

    newsArray.push(newNews);
    io.emit('newNews', newNews);
    res.json(newNews);
});

// API للستوري
app.get('/api/stories', authenticateToken, (req, res) => {
    // إظهار الستوري النشطة فقط (خلال 24 ساعة)
    const activeStories = storiesArray.filter(s => {
        const storyTime = new Date(s.timestamp);
        const now = new Date();
        return (now - storyTime) < 24 * 60 * 60 * 1000;
    });
    res.json(activeStories);
});

app.post('/api/stories', authenticateToken, upload.single('storyImage'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'يجب رفع صورة أو فيديو' });
    }

    const { text } = req.body;
    const newStory = {
        id: storiesArray.length + 1,
        image: `/uploads/${req.file.filename}`,
        text: text || '',
        display_name: req.user.displayName,
        timestamp: new Date().toISOString(),
        user_id: req.user.id
    };

    storiesArray.push(newStory);
    io.emit('newStory', newStory);
    res.json(newStory);
});

// API للإشعارات
app.post('/api/send-notification', authenticateToken, (req, res) => {
    // التحقق من الصلاحيات - فقط الإداريين والمالكين يمكنهم إرسال إشعارات للآخرين
    if (req.user.role !== 'admin' && req.user.role !== 'owner') {
        return res.status(403).json({ error: 'غير مسموح - للإداريين فقط' });
    }

    const { recipientId, message, type = 'info' } = req.body;
    
    if (!message) {
        return res.status(400).json({ error: 'يجب إدخال رسالة الإشعار' });
    }

    if (!recipientId) {
        return res.status(400).json({ error: 'يجب تحديد المستخدم المستقبل' });
    }

    const notification = {
        id: notificationsArray.length + 1,
        recipientId: parseInt(recipientId),
        message,
        type,
        senderName: req.user.display_name || req.user.email,
        timestamp: new Date().toISOString(),
        read: false
    };

    notificationsArray.push(notification);
    
    // إرسال إشعار مباشر للمستخدم باستخدام user ID
    io.to(`user_${recipientId}`).emit('newNotification', notification);
    
    res.json({ success: true, message: 'تم إرسال الإشعار بنجاح' });
});

app.get('/api/notifications', authenticateToken, (req, res) => {
    const userNotifications = notificationsArray.filter(n => n.recipientId === req.user.id);
    res.json(userNotifications);
});

// API للرسائل الخاصة
app.get('/api/private-messages/:userId', authenticateToken, (req, res) => {
    const otherUserId = parseInt(req.params.userId);
    const currentUserId = req.user.id;
    
    db.all(`SELECT m.*, u.display_name, u.rank, u.profile_image1 
            FROM messages m 
            JOIN users u ON m.user_id = u.id 
            WHERE m.is_private = TRUE 
            AND ((m.user_id = ? AND m.receiver_id = ?) OR (m.user_id = ? AND m.receiver_id = ?))
            ORDER BY m.timestamp ASC 
            LIMIT 100`, 
        [currentUserId, otherUserId, otherUserId, currentUserId], 
        (err, messages) => {
            if (err) {
                return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
            }
            res.json(messages);
        });
});

// API للحصول على جميع المستخدمين (للإشعارات والطرد)
app.get('/api/all-users-list', authenticateToken, (req, res) => {
    db.all('SELECT id, display_name, role, rank, profile_image1, is_online FROM users WHERE id != ? ORDER BY is_online DESC, display_name ASC', 
        [req.user.id], (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
        }
        res.json(users);
    });
});

// API للحصول على المتصلين حالياً
app.get('/api/online-users', authenticateToken, (req, res) => {
    db.all('SELECT id, display_name, role, rank, profile_image1 FROM users WHERE is_online = 1 ORDER BY display_name ASC', 
        [], (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
        }
        res.json(users);
    });
});

// إدارة الخلفيات
app.get('/api/backgrounds', authenticateToken, (req, res) => {
    db.all('SELECT * FROM backgrounds ORDER BY created_at DESC', [], (err, backgrounds) => {
        if (err) {
            return res.status(500).json({ error: 'خطأ في قاعدة البيانات' });
        }
        res.json(backgrounds);
    });
});

app.post('/api/backgrounds', authenticateToken, upload.single('background'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'يرجى اختيار صورة' });
    }

    const { name } = req.body;
    const image_url = `/uploads/${req.file.filename}`;

    db.run('INSERT INTO backgrounds (name, image_url, created_by) VALUES (?, ?, ?)',
        [name, image_url, req.user.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'خطأ في إضافة الخلفية' });
            }
            res.json({
                id: this.lastID,
                name,
                image_url,
                created_by: req.user.id
            });
        }
    );
});

// تحديث خلفية المستخدم
app.put('/api/user/background', authenticateToken, (req, res) => {
    const { background_image } = req.body;

    db.run('UPDATE users SET background_image = ? WHERE id = ?', 
        [background_image, req.user.id], 
        (err) => {
            if (err) {
                return res.status(500).json({ error: 'خطأ في تحديث الخلفية' });
            }
            res.json({ success: true });
        }
    );
});

// تحديث الاسم المعروض
app.put('/api/user/display-name', authenticateToken, (req, res) => {
    const { display_name } = req.body;

    if (!display_name || display_name.trim().length < 2) {
        return res.status(400).json({ error: 'الاسم يجب أن يكون حرفين على الأقل' });
    }

    db.run('UPDATE users SET display_name = ? WHERE id = ?', 
        [display_name.trim(), req.user.id], 
        (err) => {
            if (err) {
                return res.status(500).json({ error: 'خطأ في تحديث الاسم' });
            }
            res.json({ success: true, display_name: display_name.trim() });
        }
    );
});

// Socket.IO للشات المباشر
let connectedUsers = new Map();
let roomUsers = new Map(); // مستخدمي كل غرفة

// دالة لتحديث قائمة المتصلين
function updateOnlineUsersList() {
    const onlineUsers = Array.from(connectedUsers.values()).map(user => ({
        userId: user.userId,
        displayName: user.displayName,
        rank: user.rank,
        email: user.email
    }));
    
    // إرسال قائمة المتصلين لجميع المستخدمين
    io.emit('onlineUsersUpdated', onlineUsers);
}

io.on('connection', (socket) => {
    console.log('مستخدم متصل:', socket.id);

    // تسجيل المستخدم والانضمام للغرفة
    socket.on('join', (userData) => {
        // التحقق من صحة التوكن
        if (!userData.token) {
            socket.emit('error', 'غير مخول - لا يوجد توكن');
            socket.disconnect();
            return;
        }

        try {
            const decoded = jwt.verify(userData.token, JWT_SECRET);
            
            // التحقق من أن البيانات متطابقة
            if (decoded.id !== userData.userId || decoded.email !== userData.email) {
                socket.emit('error', 'غير مخول - بيانات غير صحيحة');
                socket.disconnect();
                return;
            }

            connectedUsers.set(socket.id, {
                userId: userData.userId,
                displayName: userData.displayName,
                rank: userData.rank,
                email: userData.email,
                currentRoom: userData.roomId || 1,
                verified: true
            });
        } catch (error) {
            socket.emit('error', 'غير مخول - توكن غير صحيح');
            socket.disconnect();
            return;
        }

        // الانضمام للغرفة
        const roomId = userData.roomId || 1;
        socket.join(`room_${roomId}`);
        
        // الانضمام لغرفة المستخدم الشخصية للإشعارات المستهدفة
        socket.join(`user_${userData.userId}`);

        // تحديث حالة المستخدم إلى متصل
        db.run('UPDATE users SET is_online = TRUE WHERE id = ?', [userData.userId]);

        // تحديث قائمة مستخدمي الغرفة
        if (!roomUsers.has(roomId)) {
            roomUsers.set(roomId, new Set());
        }
        roomUsers.get(roomId).add(socket.id);

        // إرسال قائمة المستخدمين في الغرفة
        const roomUsersList = Array.from(roomUsers.get(roomId) || []).map(socketId => connectedUsers.get(socketId)).filter(Boolean);
        io.to(`room_${roomId}`).emit('roomUsersList', roomUsersList);
        
        // إرسال قائمة المتصلين لجميع المستخدمين
        updateOnlineUsersList();
    });

    // تغيير الغرفة
    socket.on('changeRoom', (newRoomId) => {
        const user = connectedUsers.get(socket.id);
        if (!user || !user.verified) {
            socket.emit('error', 'غير مخول - يجب تسجيل الدخول أولاً');
            return;
        }

        const oldRoomId = user.currentRoom;

        // مغادرة الغرفة القديمة
        socket.leave(`room_${oldRoomId}`);
        if (roomUsers.has(oldRoomId)) {
            roomUsers.get(oldRoomId).delete(socket.id);
        }

        // الانضمام للغرفة الجديدة
        socket.join(`room_${newRoomId}`);
        user.currentRoom = newRoomId;

        if (!roomUsers.has(newRoomId)) {
            roomUsers.set(newRoomId, new Set());
        }
        roomUsers.get(newRoomId).add(socket.id);

        // تحديث قوائم المستخدمين
        const oldRoomUsersList = Array.from(roomUsers.get(oldRoomId) || []).map(socketId => connectedUsers.get(socketId)).filter(Boolean);
        const newRoomUsersList = Array.from(roomUsers.get(newRoomId) || []).map(socketId => connectedUsers.get(socketId)).filter(Boolean);

        io.to(`room_${oldRoomId}`).emit('roomUsersList', oldRoomUsersList);
        io.to(`room_${newRoomId}`).emit('roomUsersList', newRoomUsersList);

        socket.emit('roomChanged', newRoomId);
    });

    // إرسال رسالة في غربة
    socket.on('sendMessage', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user || !user.verified) {
            socket.emit('error', 'غير مخول - يجب تسجيل الدخول أولاً');
            return;
        }

        const roomId = data.roomId || user.currentRoom || 1;

        // تحديد نوع الرسالة وحفظها
        let query, params;

        if (data.voice_url) {
            // رسالة صوتية
            query = 'INSERT INTO messages (user_id, email, voice_url, room_id) VALUES (?, ?, ?, ?)';
            params = [user.userId, user.email, data.voice_url, roomId];
        } else if (data.image_url) {
            // رسالة صورة
            query = 'INSERT INTO messages (user_id, email, image_url, room_id) VALUES (?, ?, ?, ?)';
            params = [user.userId, user.email, data.image_url, roomId];
        } else {
            // رسالة نصية
            if (data.quoted_message_id) {
                query = 'INSERT INTO messages (user_id, email, message, room_id, quoted_message_id, quoted_author, quoted_content) VALUES (?, ?, ?, ?, ?, ?, ?)';
                params = [user.userId, user.email, data.message, roomId, data.quoted_message_id, data.quoted_author, data.quoted_content];
            } else {
                query = 'INSERT INTO messages (user_id, email, message, room_id) VALUES (?, ?, ?, ?)';
                params = [user.userId, user.email, data.message, roomId];
            }
        }

        db.run(query, params, function(err) {
                if (err) {
                    console.error('خطأ في حفظ الرسالة:', err);
                    return;
                }

                // الحصول على بيانات المستخدم الكاملة
                db.get('SELECT profile_image1, background_image, message_background FROM users WHERE id = ?', [user.userId], (err, userData) => {
                    const messageData = {
                        id: this.lastID,
                        user_id: user.userId,
                        display_name: user.displayName,
                        rank: user.rank,
                        message: data.message || null,
                        voice_url: data.voice_url || null,
                        image_url: data.image_url || null,
                        room_id: roomId,
                        quoted_message_id: data.quoted_message_id || null,
                        quoted_author: data.quoted_author || null,
                        quoted_content: data.quoted_content || null,
                        profile_image1: userData?.profile_image1,
                        background_image: userData?.background_image,
                        message_background: userData?.message_background,
                        timestamp: new Date().toISOString()
                    };

                    io.to(`room_${roomId}`).emit('newMessage', messageData);
                });
            });
    });

    // إرسال رسالة خاصة
    socket.on('sendPrivateMessage', (data) => {
        const sender = connectedUsers.get(socket.id);
        if (!sender || !sender.verified) {
            socket.emit('error', 'غير مخول - يجب تسجيل الدخول أولاً');
            return;
        }

        // تحديد نوع الرسالة وحفظها
        let query, params;

        if (data.voice_url) {
            query = 'INSERT INTO messages (user_id, email, voice_url, is_private, receiver_id) VALUES (?, ?, ?, ?, ?)';
            params = [sender.userId, sender.email, data.voice_url, true, data.receiverId];
        } else if (data.image_url) {
            query = 'INSERT INTO messages (user_id, email, image_url, is_private, receiver_id) VALUES (?, ?, ?, ?, ?)';
            params = [sender.userId, sender.email, data.image_url, true, data.receiverId];
        } else {
            query = 'INSERT INTO messages (user_id, email, message, is_private, receiver_id) VALUES (?, ?, ?, ?, ?)';
            params = [sender.userId, sender.email, data.message, true, data.receiverId];
        }

        db.run(query, params, function(err) {
                if (err) {
                    console.error('خطأ في حفظ الرسالة الخاصة:', err);
                    return;
                }

                const messageData = {
                    id: this.lastID,
                    user_id: sender.userId,
                    display_name: sender.displayName,
                    rank: sender.rank,
                    message: data.message || null,
                    voice_url: data.voice_url || null,
                    image_url: data.image_url || null,
                    is_private: true,
                    receiver_id: data.receiverId,
                    timestamp: new Date().toISOString()
                };

                // إرسال الرسالة للمرسل والمستقبل فقط
                socket.emit('newPrivateMessage', messageData);

                // البحث عن socket المستقبل وإرسال الرسالة له
                for (let [socketId, userData] of connectedUsers) {
                    if (userData.userId === data.receiverId) {
                        socket.to(socketId).emit('newPrivateMessage', messageData);
                        break;
                    }
                }
            });
    });

    // إرسال رسالة صوتية في الغرفة
    socket.on('sendVoice', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user || !user.verified) {
            socket.emit('error', 'غير مخول - يجب تسجيل الدخول أولاً');
            return;
        }

        const roomId = data.roomId || user.currentRoom || 1;

        socket.emit('sendMessage', {
            voice_url: data.voice_url,
            roomId: roomId
        });
    });

    // إرسال رسالة صوتية خاصة
    socket.on('sendPrivateVoice', (data) => {
        const sender = connectedUsers.get(socket.id);
        if (!sender || !sender.verified) {
            socket.emit('error', 'غير مخول - يجب تسجيل الدخول أولاً');
            return;
        }

        socket.emit('sendPrivateMessage', {
            voice_url: data.voice_url,
            receiverId: data.receiverId
        });
    });

    // إرسال صورة في الغرفة
    socket.on('sendImage', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user || !user.verified) {
            socket.emit('error', 'غير مخول - يجب تسجيل الدخول أولاً');
            return;
        }

        const roomId = data.roomId || user.currentRoom || 1;

        socket.emit('sendMessage', {
            image_url: data.image_url,
            roomId: roomId
        });
    });

    // إرسال صورة خاصة
    socket.on('sendPrivateImage', (data) => {
        const sender = connectedUsers.get(socket.id);
        if (!sender || !sender.verified) {
            socket.emit('error', 'غير مخول - يجب تسجيل الدخول أولاً');
            return;
        }

        socket.emit('sendPrivateMessage', {
            image_url: data.image_url,
            receiverId: data.receiverId
        });
    });

    // حذف رسالة
    socket.on('deleteMessage', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user || !user.verified) {
            socket.emit('error', 'غير مخول - يجب تسجيل الدخول أولاً');
            return;
        }
        io.to(`room_${data.roomId}`).emit('messageDeleted', data.messageId);
    });

    // حذف رسالة خاصة
    socket.on('deletePrivateMessage', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user || !user.verified) {
            socket.emit('error', 'غير مخول - يجب تسجيل الدخول أولاً');
            return;
        }
        
        // إشعار المستخدمين المعنيين بحذف الرسالة
        socket.emit('privateMessageDeleted', data.messageId);

        // البحث عن المستقبل وإشعاره
        for (let [socketId, userData] of connectedUsers) {
            if (userData.userId === data.receiverId) {
                socket.to(socketId).emit('privateMessageDeleted', data.messageId);
                break;
            }
        }
    });

    // قطع الاتصال
    socket.on('disconnect', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            // تحديث حالة المستخدم إلى غير متصل
            db.run('UPDATE users SET is_online = FALSE WHERE id = ?', [user.userId]);

            // إزالة من قائمة الغرفة
            const roomId = user.currentRoom;
            if (roomUsers.has(roomId)) {
                roomUsers.get(roomId).delete(socket.id);
                const roomUsersList = Array.from(roomUsers.get(roomId) || []).map(socketId => connectedUsers.get(socketId)).filter(Boolean);
                io.to(`room_${roomId}`).emit('roomUsersList', roomUsersList);
            }

            connectedUsers.delete(socket.id);
        }
        console.log('مستخدم منقطع:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`الخادم يعمل على البورت ${PORT}`);
});

