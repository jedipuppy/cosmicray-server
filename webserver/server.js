const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = express();
const port = 3000;

// JWT Secret (本番環境では環境変数から取得)
const JWT_SECRET = process.env.JWT_SECRET || 'cosmic-watch-secret-key-change-in-production';

app.use(express.json());
app.use(express.static('public'));
app.use('/viewer', express.static('cosmicray-viewer'));

// データディレクトリの作成
const dataDir = './cosmicray-data';
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// ユーザーデータファイル
const usersFile = './users.json';

// ユーザー管理関数
function loadUsers() {
    if (fs.existsSync(usersFile)) {
        try {
            return JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        } catch (err) {
            console.error('Error loading users:', err);
            return { users: [] };
        }
    }
    return { users: [] };
}

function saveUsers(userData) {
    try {
        fs.writeFileSync(usersFile, JSON.stringify(userData, null, 2));
        return true;
    } catch (err) {
        console.error('Error saving users:', err);
        return false;
    }
}

function findUser(id) {
    const userData = loadUsers();
    return userData.users.find(user => user.id === id);
}

// 認証ミドルウェア
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// 認証エンドポイント
app.post('/auth/login', async (req, res) => {
    const { id, password } = req.body;
    
    if (!id || !password) {
        return res.status(400).json({ error: 'ID and password are required' });
    }
    
    const user = findUser(id);
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    try {
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // JWTトークン生成
        const token = jwt.sign(
            { id: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        // 最終ログイン時刻更新
        const userData = loadUsers();
        const userIndex = userData.users.findIndex(u => u.id === id);
        userData.users[userIndex].last_login = new Date().toISOString();
        saveUsers(userData);
        
        res.json({
            success: true,
            token: token,
            user: {
                id: user.id,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/auth/register', async (req, res) => {
    const { id, password, comment, gps_latitude, gps_longitude } = req.body;
    
    if (!id || !password) {
        return res.status(400).json({ error: 'ID and password are required' });
    }
    
    const existingUser = findUser(id);
    if (existingUser) {
        return res.status(409).json({ error: 'User ID already exists' });
    }
    
    try {
        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);
        
        const userData = loadUsers();
        const newUser = {
            id,
            password_hash,
            role: 'user',
            comment: comment || '',
            gps_latitude: gps_latitude || null,
            gps_longitude: gps_longitude || null,
            created_at: new Date().toISOString(),
            last_login: null
        };
        
        userData.users.push(newUser);
        
        if (saveUsers(userData)) {
            res.json({
                success: true,
                message: 'User registered successfully',
                user: {
                    id: newUser.id,
                    role: newUser.role
                }
            });
        } else {
            res.status(500).json({ error: 'Failed to save user data' });
        }
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/auth/verify', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user.id,
            role: req.user.role
        }
    });
});

app.get('/auth/validate', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user.id,
            role: req.user.role
        }
    });
});

app.post('/auth/refresh', (req, res) => {
    const { user_id } = req.body;
    
    if (!user_id) {
        return res.status(400).json({ error: 'User ID is required' });
    }
    
    const user = findUser(user_id);
    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }
    
    try {
        // Generate new JWT token
        const token = jwt.sign(
            { id: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            token: token,
            user: {
                id: user.id,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Token refresh error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ID setup endpoint (認証必須)
app.post('/setup-id', authenticateToken, (req, res) => {
    const { id, comment, gps_latitude, gps_longitude, created_at } = req.body;
    
    if (!id) {
        return res.status(400).json({ error: 'ID is required' });
    }
    
    const idDir = path.join(dataDir, id);
    const configPath = path.join(idDir, 'config.json');
    
    try {
        // Create ID directory if it doesn't exist
        if (!fs.existsSync(idDir)) {
            fs.mkdirSync(idDir, { recursive: true });
        }
        
        // Create or update config.json
        const config = {
            id,
            comment,
            gps_latitude,
            gps_longitude,
            created_at,
            server_setup_at: new Date().toISOString()
        };
        
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        
        console.log(`ID setup complete: ${id}`);
        res.json({ 
            success: true, 
            message: `ID directory created: ${id}`,
            config: config
        });
    } catch (err) {
        console.error('Error setting up ID:', err);
        res.status(500).json({ error: 'Failed to setup ID' });
    }
});

// Check if ID exists
app.get('/check-id/:id', (req, res) => {
    const { id } = req.params;
    const idDir = path.join(dataDir, id);
    const configPath = path.join(idDir, 'config.json');
    
    if (fs.existsSync(idDir) && fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            res.json({ exists: true, config });
        } catch (err) {
            res.json({ exists: false, error: 'Invalid config file' });
        }
    } else {
        res.json({ exists: false });
    }
});

// 宇宙線データのアップロード (ID別、認証必須)
app.post('/upload-data/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    
    // ユーザーは自分のIDにのみアップロード可能
    if (req.user.id !== id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied: can only upload to your own ID' });
    }
    const { timestamp, adc, vol, deadtime } = req.body;
    
    if (!timestamp || !adc || !vol || !deadtime) {
        return res.status(400).json({ error: 'Missing required data' });
    }
    
    const idDir = path.join(dataDir, id);
    if (!fs.existsSync(idDir)) {
        return res.status(404).json({ error: 'ID directory not found' });
    }
    
    // イベントのタイムスタンプから日付を取得
    const eventDate = timestamp.split('-').slice(0, 3).join('-'); // YYYY-MM-DD
    const filePath = path.join(idDir, `${eventDate}.dat`);
    const dataLine = `${adc}\t${timestamp}\t${vol}\t${deadtime}\n`;
    
    fs.appendFile(filePath, dataLine, (err) => {
        if (err) {
            console.error('Error writing data:', err);
            return res.status(500).json({ error: 'Failed to save data' });
        }
        
        console.log(`Data saved [${id}]: ${timestamp} - ADC: ${adc}, Vol: ${vol}, Deadtime: ${deadtime}`);
        res.json({ success: true, message: 'Data uploaded successfully' });
    });
});

// リアルタイムデータ表示用エンドポイント (ID別)
app.get('/latest-data/:id', (req, res) => {
    const { id } = req.params;
    const idDir = path.join(dataDir, id);
    
    if (!fs.existsSync(idDir)) {
        return res.status(404).json({ error: 'ID not found' });
    }
    
    const date = new Date().toISOString().split('T')[0];
    const filePath = path.join(idDir, `${date}.dat`);
    
    if (!fs.existsSync(filePath)) {
        return res.json({ data: [] });
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.trim().split('\n').slice(-10); // 最新10件
    const data = lines.map(line => {
        const [adc, timestamp, vol, deadtime] = line.split('\t');
        return { timestamp, adc, vol, deadtime };
    });
    
    res.json({ data });
});

// 全IDリスト取得
app.get('/list-ids', (req, res) => {
    try {
        if (!fs.existsSync(dataDir)) {
            return res.json({ ids: [] });
        }
        
        const ids = fs.readdirSync(dataDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => {
                const configPath = path.join(dataDir, dirent.name, 'config.json');
                let config = null;
                try {
                    if (fs.existsSync(configPath)) {
                        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    }
                } catch (err) {
                    console.error(`Error reading config for ${dirent.name}:`, err);
                }
                return {
                    id: dirent.name,
                    config: config
                };
            });
        
        res.json({ ids });
    } catch (err) {
        console.error('Error listing IDs:', err);
        res.status(500).json({ error: 'Failed to list IDs' });
    }
});

// Viewer API endpoints
app.get('/api/files/:id', (req, res) => {
    const { id } = req.params;
    const idDir = path.join(dataDir, id);
    
    if (!fs.existsSync(idDir)) {
        return res.status(404).json({ error: 'ID not found' });
    }
    
    try {
        // Get config
        const configPath = path.join(idDir, 'config.json');
        let config = null;
        if (fs.existsSync(configPath)) {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        
        // Get data files
        const files = fs.readdirSync(idDir)
            .filter(file => file.endsWith('.dat'))
            .map(file => {
                const filePath = path.join(idDir, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    size: stats.size,
                    mtime: stats.mtime
                };
            })
            .sort((a, b) => b.mtime - a.mtime); // Sort by modification time, newest first
        
        res.json({ config, files });
    } catch (err) {
        console.error('Error listing files:', err);
        res.status(500).json({ error: 'Failed to list files' });
    }
});

app.get('/api/data/:id/:filename', (req, res) => {
    const { id, filename } = req.params;
    const filePath = path.join(dataDir, id, filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.trim().split('\n').filter(line => line.length > 0);
        
        const data = lines.map(line => {
            const [adc, timestamp, vol, deadtime] = line.split('\t');
            return { timestamp, adc, vol, deadtime };
        });
        
        res.json({ data, count: data.length });
    } catch (err) {
        console.error('Error reading data file:', err);
        res.status(500).json({ error: 'Failed to read data file' });
    }
});

app.get('/api/download/:id/:filename', (req, res) => {
    const { id, filename } = req.params;
    const filePath = path.join(dataDir, id, filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    
    res.download(filePath, `${id}_${filename}`);
});

// ヘルスチェック
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Cosmic Watch Server running at http://0.0.0.0:${port}`);
    console.log(`Data will be saved to: ${path.resolve(dataDir)}`);
});