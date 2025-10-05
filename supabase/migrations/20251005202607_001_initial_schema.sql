/*
  # إنشاء قاعدة بيانات شات وتين العقرب الكاملة
  
  1. جداول جديدة:
    - users (المستخدمون): معلومات المستخدمين الكاملة
    - rooms (الغرف): غرف الدردشة
    - messages (الرسائل): رسائل الدردشة العامة
    - private_messages (الرسائل الخاصة): الرسائل الخاصة بين المستخدمين
    - news (الأخبار): منشورات الأخبار
    - stories (القصص): القصص اليومية
    - bans (الحظر): سجل الحظر
    - mutes (الكتم): سجل الكتم
    - coins_transactions (معاملات النقاط): سجل نقاط المستخدمين
    - shop_items (عناصر المتجر): الإطارات والزخارف
    - user_items (عناصر المستخدم): العناصر المملوكة
    
  2. الأمان:
    - تفعيل RLS على كل الجداول
    - سياسات للتحكم بالوصول
*/

-- جدول المستخدمين
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  display_name text NOT NULL,
  rank text DEFAULT 'visitor',
  role text DEFAULT 'user',
  coins integer DEFAULT 2000,
  profile_image1 text,
  profile_image2 text,
  cover_image text,
  message_background text,
  age integer,
  gender text,
  marital_status text,
  about_me text,
  name_color text DEFAULT '#ffffff',
  font_color text DEFAULT '#000000',
  name_decoration text,
  profile_music text,
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- جدول الغرف
CREATE TABLE IF NOT EXISTS rooms (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  background text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

-- جدول الرسائل العامة
CREATE TABLE IF NOT EXISTS messages (
  id serial PRIMARY KEY,
  room_id integer REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  content text,
  type text DEFAULT 'text',
  image_url text,
  voice_url text,
  quoted_message_id integer,
  created_at timestamptz DEFAULT now()
);

-- جدول الرسائل الخاصة
CREATE TABLE IF NOT EXISTS private_messages (
  id serial PRIMARY KEY,
  sender_id uuid REFERENCES users(id),
  receiver_id uuid REFERENCES users(id),
  content text,
  type text DEFAULT 'text',
  image_url text,
  voice_url text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- جدول الأخبار
CREATE TABLE IF NOT EXISTS news (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  content text,
  media text,
  likes jsonb DEFAULT '[]',
  reactions jsonb DEFAULT '{}',
  pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- جدول التعليقات
CREATE TABLE IF NOT EXISTS comments (
  id serial PRIMARY KEY,
  post_id integer REFERENCES news(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- جدول القصص
CREATE TABLE IF NOT EXISTS stories (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  image text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- جدول الحظر
CREATE TABLE IF NOT EXISTS bans (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  banned_by uuid REFERENCES users(id),
  reason text,
  duration text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- جدول الكتم
CREATE TABLE IF NOT EXISTS mutes (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  muted_by uuid REFERENCES users(id),
  reason text,
  duration text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- جدول معاملات النقاط
CREATE TABLE IF NOT EXISTS coins_transactions (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  amount integer NOT NULL,
  type text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- جدول عناصر المتجر
CREATE TABLE IF NOT EXISTS shop_items (
  id serial PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  price integer NOT NULL,
  image text,
  description text,
  required_rank text,
  created_at timestamptz DEFAULT now()
);

-- جدول عناصر المستخدم
CREATE TABLE IF NOT EXISTS user_items (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  item_id integer REFERENCES shop_items(id),
  is_active boolean DEFAULT false,
  purchased_at timestamptz DEFAULT now()
);

-- جدول الإشعارات
CREATE TABLE IF NOT EXISTS notifications (
  id serial PRIMARY KEY,
  user_id uuid REFERENCES users(id),
  type text NOT NULL,
  content text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- إدراج غرفة افتراضية
INSERT INTO rooms (id, name, description) 
VALUES (1, 'الغرفة الرئيسية', 'غرفة دردشة عامة')
ON CONFLICT DO NOTHING;

-- إدراج حساب المالك
INSERT INTO users (email, password, display_name, rank, role, coins) 
VALUES ('njdj9985@gmail.com', 'Zxcvbnm.8', 'مالك الموقع 👑', 'chat_star', 'owner', 999999999)
ON CONFLICT (email) DO NOTHING;

-- تفعيل RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coins_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- سياسات المستخدمين
CREATE POLICY "المستخدمون يمكنهم قراءة كل الملفات"
  ON users FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "المستخدمون يمكنهم تحديث ملفاتهم الخاصة"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- سياسات الغرف
CREATE POLICY "الجميع يمكنهم قراءة الغرف"
  ON rooms FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "المسؤولون فقط يمكنهم إنشاء غرف"
  ON rooms FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- سياسات الرسائل
CREATE POLICY "الجميع يمكنهم قراءة الرسائل"
  ON messages FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "المستخدمون يمكنهم إرسال رسائل"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- سياسات الرسائل الخاصة
CREATE POLICY "المستخدمون يمكنهم قراءة رسائلهم الخاصة"
  ON private_messages FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "المستخدمون يمكنهم إرسال رسائل خاصة"
  ON private_messages FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

-- سياسات الأخبار
CREATE POLICY "الجميع يمكنهم قراءة الأخبار"
  ON news FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "المستخدمون يمكنهم نشر أخبار"
  ON news FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "المستخدمون يمكنهم تحديث أخبارهم"
  ON news FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- سياسات التعليقات
CREATE POLICY "الجميع يمكنهم قراءة التعليقات"
  ON comments FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "المستخدمون يمكنهم إضافة تعليقات"
  ON comments FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- سياسات القصص
CREATE POLICY "الجميع يمكنهم قراءة القصص"
  ON stories FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "المستخدمون يمكنهم نشر قصص"
  ON stories FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- سياسات الحظر والكتم
CREATE POLICY "المسؤولون فقط يمكنهم رؤية الحظر"
  ON bans FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'admin', 'moderator')
    )
  );

CREATE POLICY "المسؤولون فقط يمكنهم حظر المستخدمين"
  ON bans FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'admin', 'moderator')
    )
  );

CREATE POLICY "المسؤولون فقط يمكنهم رؤية الكتم"
  ON mutes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'admin', 'moderator')
    )
  );

CREATE POLICY "المسؤولون فقط يمكنهم كتم المستخدمين"
  ON mutes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'admin', 'moderator')
    )
  );

-- سياسات معاملات النقاط
CREATE POLICY "المستخدمون يمكنهم رؤية معاملاتهم"
  ON coins_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "النظام يمكنه إضافة معاملات"
  ON coins_transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- سياسات المتجر
CREATE POLICY "الجميع يمكنهم رؤية عناصر المتجر"
  ON shop_items FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "المسؤولون فقط يمكنهم إضافة عناصر للمتجر"
  ON shop_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- سياسات عناصر المستخدم
CREATE POLICY "المستخدمون يمكنهم رؤية عناصرهم"
  ON user_items FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "المستخدمون يمكنهم شراء عناصر"
  ON user_items FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "المستخدمون يمكنهم تفعيل/إلغاء تفعيل عناصرهم"
  ON user_items FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- سياسات الإشعارات
CREATE POLICY "المستخدمون يمكنهم رؤية إشعاراتهم"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "النظام يمكنه إنشاء إشعارات"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "المستخدمون يمكنهم تحديث إشعاراتهم"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
