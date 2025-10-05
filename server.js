const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: '*' }
});

const JWT_SECRET = 'your-super-secret-jwt-key-change-this-in-production';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(bodyParser.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webm|mp3|wav|mp4|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('نوع الملف غير مدعوم'));
        }
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .maybeSingle();

        if (error || !user) {
            return res.status(401).json({ error: 'بيانات تسجيل الدخول غير صحيحة' });
        }

        if (user.password !== password) {
            return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
        }

        const { data: banData } = await supabase
            .from('bans')
            .select('*')
            .eq('user_id', user.id)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();

        if (banData) {
            return res.status(403).json({
                error: 'محظور',
                banned: true,
                reason: banData.reason,
                expires_at: banData.expires_at
            });
        }

        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

        await supabase
            .from('users')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', user.id);

        res.json({ token, user });
    } catch (error) {
        console.error('خطأ في تسجيل الدخول:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { email, password, display_name } = req.body;

        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (existingUser) {
            return res.status(400).json({ error: 'البريد الإلكتروني موجود مسبقاً' });
        }

        const { data: newUser, error } = await supabase
            .from('users')
            .insert([{
                email,
                password,
                display_name,
                rank: 'visitor',
                role: 'user',
                coins: 2000
            }])
            .select()
            .single();

        if (error) {
            return res.status(500).json({ error: 'فشل إنشاء الحساب' });
        }

        const token = jwt.sign({ userId: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '30d' });

        res.json({ token, user: newUser });
    } catch (error) {
        console.error('خطأ في التسجيل:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

app.post('/api/guest-login', async (req, res) => {
    try {
        const { name, age, gender } = req.body;

        const guestEmail = `guest_${Date.now()}@temp.com`;
        const guestPassword = Math.random().toString(36).substring(7);

        const { data: newUser, error } = await supabase
            .from('users')
            .insert([{
                email: guestEmail,
                password: guestPassword,
                display_name: name,
                age: parseInt(age),
                gender,
                rank: 'visitor',
                role: 'guest',
                coins: 500
            }])
            .select()
            .single();

        if (error) {
            return res.status(500).json({ error: 'فشل إنشاء حساب الزائر' });
        }

        const token = jwt.sign({ userId: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '1d' });

        res.json({ token, user: newUser });
    } catch (error) {
        console.error('خطأ في دخول الزائر:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('id', decoded.userId)
            .single();

        if (!user) {
            return res.status(401).json({ error: 'غير مصرح' });
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'غير مصرح' });
    }
};

app.get('/api/user/profile', authMiddleware, async (req, res) => {
    res.json(req.user);
});

app.put('/api/user/profile', authMiddleware, upload.fields([
    { name: 'profileImage1', maxCount: 1 },
    { name: 'profileImage2', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 },
    { name: 'messageBackground', maxCount: 1 }
]), async (req, res) => {
    try {
        const updates = {};

        if (req.body.display_name) updates.display_name = req.body.display_name;
        if (req.body.age) updates.age = parseInt(req.body.age);
        if (req.body.gender) updates.gender = req.body.gender;
        if (req.body.marital_status) updates.marital_status = req.body.marital_status;
        if (req.body.about_me) updates.about_me = req.body.about_me;
        if (req.body.name_color) updates.name_color = req.body.name_color;
        if (req.body.font_color) updates.font_color = req.body.font_color;
        if (req.body.name_decoration) updates.name_decoration = req.body.name_decoration;

        if (req.files['profileImage1']) updates.profile_image1 = `/uploads/${req.files['profileImage1'][0].filename}`;
        if (req.files['profileImage2']) updates.profile_image2 = `/uploads/${req.files['profileImage2'][0].filename}`;
        if (req.files['coverImage']) updates.cover_image = `/uploads/${req.files['coverImage'][0].filename}`;
        if (req.files['messageBackground']) updates.message_background = `/uploads/${req.files['messageBackground'][0].filename}`;

        const { data: updatedUser, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', req.user.id)
            .select()
            .single();

        if (error) {
            return res.status(500).json({ error: 'فشل تحديث الملف الشخصي' });
        }

        io.emit('userUpdated', updatedUser);
        res.json(updatedUser);
    } catch (error) {
        console.error('خطأ في تحديث الملف الشخصي:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

app.get('/api/rooms', async (req, res) => {
    try {
        const { data: rooms, error } = await supabase
            .from('rooms')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) throw error;
        res.json(rooms);
    } catch (error) {
        console.error('خطأ في جلب الغرف:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

app.post('/api/rooms', authMiddleware, upload.single('background'), async (req, res) => {
    try {
        if (req.user.role !== 'owner' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'غير مسموح' });
        }

        const { name, description } = req.body;
        const background = req.file ? `/uploads/${req.file.filename}` : null;

        const { data: newRoom, error } = await supabase
            .from('rooms')
            .insert([{ name, description, background, created_by: req.user.id }])
            .select()
            .single();

        if (error) throw error;

        io.emit('roomCreated', newRoom);
        res.json(newRoom);
    } catch (error) {
        console.error('خطأ في إنشاء الغرفة:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

app.delete('/api/rooms/:id', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'owner' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'غير مسموح' });
        }

        const roomId = parseInt(req.params.id);

        const { error } = await supabase
            .from('rooms')
            .delete()
            .eq('id', roomId);

        if (error) throw error;

        io.emit('roomDeleted', roomId);
        res.json({ message: 'تم حذف الغرفة' });
    } catch (error) {
        console.error('خطأ في حذف الغرفة:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

app.get('/api/messages/:roomId', async (req, res) => {
    try {
        const { data: messages, error } = await supabase
            .from('messages')
            .select(`
                *,
                users (display_name, rank, profile_image1)
            `)
            .eq('room_id', parseInt(req.params.roomId))
            .order('created_at', { ascending: true })
            .limit(100);

        if (error) throw error;
        res.json(messages);
    } catch (error) {
        console.error('خطأ في جلب الرسائل:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('id, display_name, rank, role, profile_image1, age, gender, last_seen')
            .order('last_seen', { ascending: false });

        if (error) throw error;
        res.json(users);
    } catch (error) {
        console.error('خطأ في جلب المستخدمين:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

app.post('/api/ban', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'owner' && req.user.role !== 'admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'غير مسموح' });
        }

        const { userId, reason, duration } = req.body;

        let expiresAt = null;
        if (duration !== 'permanent') {
            const durationMap = {
                '5m': 5 * 60 * 1000,
                '1h': 60 * 60 * 1000,
                '24h': 24 * 60 * 60 * 1000,
                '7d': 7 * 24 * 60 * 60 * 1000
            };
            expiresAt = new Date(Date.now() + durationMap[duration]).toISOString();
        }

        const { data: ban, error } = await supabase
            .from('bans')
            .insert([{
                user_id: userId,
                banned_by: req.user.id,
                reason,
                duration,
                expires_at: expiresAt
            }])
            .select()
            .single();

        if (error) throw error;

        io.emit('userBanned', { userId, reason, duration });
        res.json({ message: 'تم حظر المستخدم', ban });
    } catch (error) {
        console.error('خطأ في حظر المستخدم:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

app.post('/api/mute', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'owner' && req.user.role !== 'admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'غير مسموح' });
        }

        const { userId, reason, duration } = req.body;

        let expiresAt = null;
        if (duration !== 'permanent') {
            const durationMap = {
                '5m': 5 * 60 * 1000,
                '1h': 60 * 60 * 1000,
                '24h': 24 * 60 * 60 * 1000,
                '7d': 7 * 24 * 60 * 60 * 1000
            };
            expiresAt = new Date(Date.now() + durationMap[duration]).toISOString();
        }

        const { data: mute, error } = await supabase
            .from('mutes')
            .insert([{
                user_id: userId,
                muted_by: req.user.id,
                reason,
                duration,
                expires_at: expiresAt
            }])
            .select()
            .single();

        if (error) throw error;

        io.emit('userMuted', { userId, reason, duration });
        res.json({ message: 'تم كتم المستخدم', mute });
    } catch (error) {
        console.error('خطأ في كتم المستخدم:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

app.post('/api/assign-rank', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'owner' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'غير مسموح' });
        }

        const { userId, rank } = req.body;

        const { data: updatedUser, error } = await supabase
            .from('users')
            .update({ rank })
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;

        io.emit('userUpdated', updatedUser);
        res.json({ message: 'تم تعيين الرتبة', user: updatedUser });
    } catch (error) {
        console.error('خطأ في تعيين الرتبة:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

app.get('/api/news', async (req, res) => {
    try {
        const { data: news, error } = await supabase
            .from('news')
            .select(`
                *,
                users (display_name, rank, profile_image1)
            `)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        res.json(news);
    } catch (error) {
        console.error('خطأ في جلب الأخبار:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

app.post('/api/news', authMiddleware, upload.single('media'), async (req, res) => {
    try {
        const { content } = req.body;
        const media = req.file ? `/uploads/${req.file.filename}` : null;

        const { data: newNews, error } = await supabase
            .from('news')
            .insert([{
                user_id: req.user.id,
                content,
                media
            }])
            .select(`
                *,
                users (display_name, rank, profile_image1)
            `)
            .single();

        if (error) throw error;

        io.emit('newNews', newNews);
        res.json(newNews);
    } catch (error) {
        console.error('خطأ في نشر الأخبار:', error);
        res.status(500).json({ error: 'حدث خطأ في الخادم' });
    }
});

const connectedUsers = new Map();
const floodProtection = new Map();

io.on('connection', async (socket) => {
    console.log('مستخدم متصل:', socket.id);

    socket.on('authenticate', async (token) => {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const { data: user } = await supabase
                .from('users')
                .select('*')
                .eq('id', decoded.userId)
                .single();

            if (user) {
                socket.user = user;
                socket.userId = user.id;
                connectedUsers.set(user.id, socket.id);

                await supabase
                    .from('users')
                    .update({ last_seen: new Date().toISOString() })
                    .eq('id', user.id);

                io.emit('userOnline', { userId: user.id, displayName: user.display_name });

                const onlineUsers = Array.from(connectedUsers.keys());
                socket.emit('onlineUsers', onlineUsers);
            }
        } catch (error) {
            console.error('خطأ في المصادقة:', error);
        }
    });

    socket.on('join', (data) => {
        socket.join(data.roomId);
        socket.currentRoom = data.roomId;
    });

    socket.on('sendMessage', async (data) => {
        try {
            if (!socket.user) return;

            const userId = socket.user.id;
            const now = Date.now();

            if (!floodProtection.has(userId)) {
                floodProtection.set(userId, []);
            }

            const userMessages = floodProtection.get(userId);
            const recentMessages = userMessages.filter(time => now - time < 10000);

            if (recentMessages.length >= 5) {
                const expiresAt = new Date(now + 5 * 60 * 1000).toISOString();
                await supabase.from('mutes').insert([{
                    user_id: userId,
                    muted_by: userId,
                    reason: 'الفيضانات - رسائل سريعة ومتكررة',
                    duration: '5m',
                    expires_at: expiresAt
                }]);

                socket.emit('error', 'تم كتمك لمدة 5 دقائق بسبب الرسائل السريعة والمتكررة');
                return;
            }

            recentMessages.push(now);
            floodProtection.set(userId, recentMessages);

            const { data: mute } = await supabase
                .from('mutes')
                .select('*')
                .eq('user_id', userId)
                .or(`duration.eq.permanent,expires_at.gt.${new Date().toISOString()}`)
                .maybeSingle();

            if (mute) {
                return socket.emit('error', 'أنت مكتوم ولا يمكنك إرسال الرسائل');
            }

            const { data: message, error } = await supabase
                .from('messages')
                .insert([{
                    room_id: data.roomId,
                    user_id: userId,
                    content: data.content,
                    type: 'text'
                }])
                .select(`
                    *,
                    users (display_name, rank, profile_image1)
                `)
                .single();

            if (error) throw error;

            io.to(data.roomId).emit('newMessage', message);
        } catch (error) {
            console.error('خطأ في إرسال الرسالة:', error);
        }
    });

    socket.on('sendPrivateMessage', async (data) => {
        try {
            if (!socket.user) return;

            const { data: message, error } = await supabase
                .from('private_messages')
                .insert([{
                    sender_id: socket.user.id,
                    receiver_id: data.receiverId,
                    content: data.content,
                    type: 'text'
                }])
                .select()
                .single();

            if (error) throw error;

            const receiverSocketId = connectedUsers.get(data.receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('newPrivateMessage', message);
            }

            socket.emit('newPrivateMessage', message);
        } catch (error) {
            console.error('خطأ في إرسال رسالة خاصة:', error);
        }
    });

    socket.on('disconnect', async () => {
        if (socket.user) {
            connectedUsers.delete(socket.user.id);

            await supabase
                .from('users')
                .update({ last_seen: new Date().toISOString() })
                .eq('id', socket.user.id);

            io.emit('userOffline', { userId: socket.user.id });
        }
        console.log('مستخدم منفصل:', socket.id);
    });
});

setInterval(() => {
    const now = Date.now();
    for (const [userId, messages] of floodProtection.entries()) {
        const recentMessages = messages.filter(time => now - time < 60000);
        if (recentMessages.length === 0) {
            floodProtection.delete(userId);
        } else {
            floodProtection.set(userId, recentMessages);
        }
    }
}, 60000);

app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🦂 شات وتين العقرب يعمل على المنفذ ${PORT}`));
