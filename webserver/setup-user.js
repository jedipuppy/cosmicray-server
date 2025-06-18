// ユーザー登録用スクリプト
const bcrypt = require('bcrypt');
const fs = require('fs');

async function createUser(id, password, comment = '', gps_lat = null, gps_lon = null) {
    const usersFile = './users.json';
    
    // 既存ユーザーデータ読み込み
    let userData = { users: [] };
    if (fs.existsSync(usersFile)) {
        try {
            userData = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        } catch (err) {
            console.error('Error reading users file:', err);
        }
    }
    
    // 重複チェック
    if (userData.users.find(user => user.id === id)) {
        console.error(`User ${id} already exists!`);
        return false;
    }
    
    try {
        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);
        
        const newUser = {
            id,
            password_hash,
            role: 'user',
            comment,
            gps_latitude: gps_lat,
            gps_longitude: gps_lon,
            created_at: new Date().toISOString(),
            last_login: null
        };
        
        userData.users.push(newUser);
        
        // ファイル保存
        fs.writeFileSync(usersFile, JSON.stringify(userData, null, 2));
        console.log(`✓ User ${id} created successfully!`);
        return true;
        
    } catch (err) {
        console.error('Error creating user:', err);
        return false;
    }
}

// コマンドライン引数から実行
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log('Usage: node setup-user.js <user_id> <password> [comment] [gps_lat] [gps_lon]');
        console.log('Example: node setup-user.js test0 password123 "Test user" "35.6762" "139.6503"');
        process.exit(1);
    }
    
    const [id, password, comment, gps_lat, gps_lon] = args;
    
    createUser(id, password, comment, gps_lat, gps_lon)
        .then(success => {
            if (success) {
                console.log('\n=== User Registration Complete ===');
                console.log(`ID: ${id}`);
                console.log(`Comment: ${comment || 'None'}`);
                if (gps_lat && gps_lon) {
                    console.log(`GPS: ${gps_lat}, ${gps_lon}`);
                }
            }
            process.exit(success ? 0 : 1);
        })
        .catch(err => {
            console.error('Registration failed:', err);
            process.exit(1);
        });
}

module.exports = { createUser };