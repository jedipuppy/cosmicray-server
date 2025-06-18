import serial
import serial.tools.list_ports
import datetime
from time import sleep
import os
import requests
import json
import threading
import time
from collections import deque

def search_com_port():
    coms = serial.tools.list_ports.comports()
    comlist = []
    for com in coms:
        comlist.append(com.device)
    print('Connected COM ports: ' + str(comlist))
    return comlist

def select_com_port(comlist):
    if len(comlist) == 1:
        print('connected to '+comlist[0])
        return comlist[0]
    elif len(comlist) > 1:
        print('select from available ports:')
        i = 0
        for com in comlist:
            print(str(i) + ': ' + com)
            i += 1
        use_port_num = input()
        print('connected to '+comlist[int(use_port_num)])
        return comlist[int(use_port_num)]
    else:
        print("detector is not detected.")
        sleep(10)

def validate_token(server_url, token, user_id):
    """既存トークンの有効性を確認"""
    try:
        headers = {'Authorization': f'Bearer {token}'}
        response = requests.get(
            f"{server_url}/auth/validate",
            headers=headers,
            timeout=10
        )
        return response.status_code == 200
    except requests.exceptions.RequestException:
        return False

def authenticate_user(server_url, existing_config=None):
    """ユーザー認証（既存トークンがあれば再利用）"""
    
    # 既存の有効なトークンがあるかチェック
    if existing_config and existing_config.get('auth_token') and existing_config.get('id'):
        print("Checking existing authentication token...")
        if validate_token(server_url, existing_config['auth_token'], existing_config['id']):
            print(f"✓ Using existing valid token for user: {existing_config['id']}")
            return {
                'user_id': existing_config['id'],
                'token': existing_config['auth_token'],
                'role': 'user'  # デフォルト値
            }
        else:
            print("✗ Existing token is invalid or expired")
    
    # 環境変数からの認証情報取得を試す
    env_user = os.getenv('COSMIC_USER_ID')
    env_pass = os.getenv('COSMIC_PASSWORD')
    
    if env_user and env_pass:
        print(f"Using environment variables for authentication (User: {env_user})")
        try:
            response = requests.post(
                f"{server_url}/auth/login",
                json={'id': env_user, 'password': env_pass},
                timeout=10
            )
            
            if response.status_code == 200:
                auth_data = response.json()
                print(f"✓ Environment authentication successful! Welcome, {env_user}")
                return {
                    'user_id': env_user,
                    'token': auth_data['token'],
                    'role': auth_data['user']['role']
                }
            else:
                print("✗ Environment authentication failed")
        except requests.exceptions.RequestException as e:
            print(f"✗ Environment authentication error: {e}")
    
    # 対話的認証
    max_attempts = 3
    server_available = True
    
    for attempt in range(max_attempts):
        print(f"\n=== Authentication (Attempt {attempt + 1}/{max_attempts}) ===")
        try:
            user_id = input("Enter your User ID: ")
            password = input("Enter your Password: ")
        except (EOFError, KeyboardInterrupt):
            print("\nAuthentication cancelled. Exiting.")
            exit(1)
        
        try:
            response = requests.post(
                f"{server_url}/auth/login",
                json={'id': user_id, 'password': password},
                timeout=10
            )
            
            if response.status_code == 200:
                auth_data = response.json()
                print(f"✓ Authentication successful! Welcome, {user_id}")
                return {
                    'user_id': user_id,
                    'token': auth_data['token'],
                    'role': auth_data['user']['role']
                }
            else:
                error_msg = response.json().get('error', 'Unknown error')
                print(f"✗ Authentication failed: {error_msg}")
                
        except requests.exceptions.RequestException as e:
            print(f"✗ Network error: {e}")
            server_available = False
    
    # サーバーが応答しない場合、オフラインモードを提案
    if not server_available:
        print(f"\n⚠ Server at {server_url} is not reachable.")
        print("Would you like to continue in offline mode? (y/n)")
        try:
            choice = input().lower().strip()
            if choice in ['y', 'yes']:
                # オフライン用の設定を使用
                offline_user = existing_config.get('id', 'offline_user') if existing_config else 'offline_user'
                print(f"✓ Continuing in offline mode as user: {offline_user}")
                return {
                    'user_id': offline_user,
                    'token': 'offline_mode',
                    'role': 'user'
                }
        except (EOFError, KeyboardInterrupt):
            pass
    
    print("\nAuthentication failed. Exiting.")
    exit(1)

def load_or_create_config(auth_info):
    config_file = 'config.json'
    
    if os.path.exists(config_file):
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            # 設定ファイルのIDと認証されたIDが一致するかチェック
            if config.get('id') == auth_info['user_id']:
                print(f"Loaded existing config for ID: {config['id']}")
                return config
            else:
                print(f"Config ID mismatch. Creating new config for {auth_info['user_id']}")
        except (json.JSONDecodeError, KeyError):
            print("Invalid config file. Creating new one.")
    
    # Create new config
    print("\n=== Cosmic Watch Measurement Setup ===")
    print(f"User ID: {auth_info['user_id']} (authenticated)")
    comment = input("Enter measurement comment: ")
    gps_lat = input("Enter GPS latitude (optional): ")
    gps_lon = input("Enter GPS longitude (optional): ")
    
    config = {
        'id': auth_info['user_id'],
        'comment': comment,
        'gps_latitude': gps_lat if gps_lat else None,
        'gps_longitude': gps_lon if gps_lon else None,
        'created_at': datetime.datetime.now().isoformat(),
        'auth_token': auth_info['token']
    }
    
    # Save config locally
    with open(config_file, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    
    print(f"Config saved for ID: {auth_info['user_id']}")
    return config

def setup_id_on_server(config, server_url, auth_token):
    headers = {'Authorization': f'Bearer {auth_token}'}
    
    try:
        response = requests.post(
            f"{server_url}/setup-id",
            json=config,
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"✓ Server setup complete: {result['message']}")
            return True
        else:
            error_msg = response.json().get('error', f'HTTP {response.status_code}')
            print(f"✗ Server setup failed: {error_msg}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"✗ Server setup error: {e}")
        return False

class DataUploader:
    def __init__(self, measurement_id, server_url, auth_token, upload_interval=60, config=None):
        self.measurement_id = measurement_id
        self.server_url = server_url
        self.auth_token = auth_token
        self.upload_interval = upload_interval
        self.data_buffer = deque()
        self.failed_data = deque()
        self.buffer_lock = threading.Lock()
        self.upload_thread = None
        self.stop_event = threading.Event()
        self.stats = {'sent': 0, 'failed': 0, 'buffered': 0}
        self.headers = {'Authorization': f'Bearer {auth_token}'}
        self.config = config
        self.offline_mode = auth_token == 'offline_mode'
        
    def add_data(self, timestamp, adc, vol, deadtime):
        """測定データをバッファに追加（非ブロッキング）"""
        data = {
            'timestamp': timestamp,
            'adc': adc,
            'vol': vol,
            'deadtime': deadtime
        }
        
        with self.buffer_lock:
            self.data_buffer.append(data)
            self.stats['buffered'] += 1
            
    def start_uploader(self):
        """アップローダースレッド開始"""
        if self.offline_mode:
            print("Running in offline mode - data will be saved locally only")
            return
            
        self.upload_thread = threading.Thread(target=self._upload_loop, daemon=True)
        self.upload_thread.start()
        print(f"Data uploader started (interval: {self.upload_interval}s)")
        
    def stop_uploader(self):
        """アップローダー停止"""
        self.stop_event.set()
        if self.upload_thread:
            self.upload_thread.join(timeout=5)
        # 残りデータを最後に送信
        self._upload_batch(final=True)
        
    def _upload_loop(self):
        """定期アップロードループ"""
        while not self.stop_event.wait(self.upload_interval):
            self._upload_batch()
            
    def _upload_batch(self, final=False):
        """バッファ内データを一括送信"""
        with self.buffer_lock:
            if not self.data_buffer and not self.failed_data:
                return
                
            # 失敗データを優先的に再送信
            batch_data = list(self.failed_data) + list(self.data_buffer)
            if not final:
                # 通常時は一部を残してバッファサイズを制御
                batch_size = min(len(batch_data), 100)
                batch_data = batch_data[:batch_size]
                
            self.failed_data.clear()
            self.data_buffer.clear()
            
        if not batch_data:
            return
            
        print(f"Uploading {len(batch_data)} data points...")
        success_count = 0
        
        for data in batch_data:
            if self._upload_single_data(data):
                success_count += 1
                self.stats['sent'] += 1
            else:
                with self.buffer_lock:
                    self.failed_data.append(data)
                self.stats['failed'] += 1
                
        print(f"Upload completed: {success_count}/{len(batch_data)} successful")
        print(f"Stats - Sent: {self.stats['sent']}, Failed: {self.stats['failed']}, Buffered: {len(self.data_buffer)}")
        
    def _refresh_token(self):
        """トークンを再取得"""
        if not self.config:
            return False
            
        try:
            print("Attempting to refresh authentication token...")
            response = requests.post(
                f"{self.server_url}/auth/refresh",
                json={'user_id': self.config['id']},
                timeout=10
            )
            
            if response.status_code == 200:
                auth_data = response.json()
                self.auth_token = auth_data['token']
                self.headers = {'Authorization': f'Bearer {self.auth_token}'}
                
                # Update config file
                self.config['auth_token'] = self.auth_token
                with open('config.json', 'w', encoding='utf-8') as f:
                    json.dump(self.config, f, indent=2, ensure_ascii=False)
                
                print("✓ Token refreshed successfully")
                return True
            else:
                print(f"✗ Token refresh failed: HTTP {response.status_code}")
                return False
                
        except requests.exceptions.RequestException as e:
            print(f"✗ Token refresh error: {e}")
            return False

    def _upload_single_data(self, data, max_retries=3):
        """単一データをリトライ付きで送信"""
        if self.offline_mode:
            return False  # オフラインモードでは送信しない
            
        for attempt in range(max_retries):
            try:
                response = requests.post(
                    f"{self.server_url}/upload-data/{self.measurement_id}",
                    json=data,
                    headers=self.headers,
                    timeout=3
                )
                if response.status_code == 200:
                    return True
                elif response.status_code == 401 or response.status_code == 403:
                    print(f"Authentication error (attempt {attempt + 1}): HTTP {response.status_code}")
                    
                    # Try to refresh token once per upload batch
                    if attempt == 0 and self._refresh_token():
                        print("Retrying with refreshed token...")
                        continue
                    else:
                        print("Token refresh failed. Please restart the application.")
                        return False
                else:
                    print(f"Upload failed (attempt {attempt + 1}): HTTP {response.status_code}")
                    
            except requests.exceptions.RequestException as e:
                print(f"Network error (attempt {attempt + 1}): {e}")
                
            if attempt < max_retries - 1:
                sleep_time = 2 ** attempt  # 指数バックオフ: 1s, 2s, 4s
                time.sleep(sleep_time)
                
        return False

# サーバーURL設定
SERVER_URL = "http://accel-kitchen.com:3000"  # 本番サーバー用

# Load existing config first
config = None
config_file = 'config.json'
if os.path.exists(config_file):
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            config = json.load(f)
    except (json.JSONDecodeError, KeyError):
        config = None

# Authenticate user (will use existing token if valid)
auth_info = authenticate_user(SERVER_URL, config)

# Load or create configuration
config = load_or_create_config(auth_info)
measurement_id = config['id']
auth_token = config.get('auth_token', auth_info['token'])

# Setup ID on server
if auth_token != 'offline_mode':
    print("Setting up measurement ID on server...")
    if not setup_id_on_server(config, SERVER_URL, auth_token):
        print("Warning: Server setup failed, but continuing with local backup...")
else:
    print("Offline mode - skipping server setup")

# Initialize data uploader
uploader = DataUploader(measurement_id, SERVER_URL, auth_token, upload_interval=60, config=config)
uploader.start_uploader()

# ready serial com.
comlist = search_com_port()
use_port = select_com_port(comlist)
ser = serial.Serial(use_port, 9600)

# シリアルバッファをクリア
ser.reset_input_buffer()
ser.reset_output_buffer()
print("Serial buffers cleared")

# prepare plotting
data = {
    'time': [],
    'adc': [],
    'vol': [],
    'deadtime': []
}

# time start
start_time = datetime.datetime.now()

# prepare local backup directory
local_data_dir = f'./data/{measurement_id}'
try:
    os.makedirs(local_data_dir, exist_ok=True)
except OSError as e:
    print(f"Error creating directory: {e}")
    exit(1)

if auth_token != 'offline_mode':
    print(f"Starting measurement... Uploading to {SERVER_URL}")
else:
    print("Starting measurement... Running in offline mode (local backup only)")
print("Press Ctrl+C to stop")

# read lines
try:
    while True:
        current_time = datetime.datetime.now()
        # ローカルファイル用の現在日付
        f = open(os.path.join(local_data_dir, current_time.strftime('%Y-%m-%d')+'.dat'), 'a')
        try:
            # データを読み取り、改行文字を除去してから分割
            raw_line = ser.readline().decode('utf-8').strip()
            if not raw_line:  # 空行をスキップ
                continue
            line = raw_line.split()
        except UnicodeDecodeError:
            continue
        except Exception as e:
            print(f"Serial read error: {e}")
            continue
        
        # データの妥当性チェック
        if (len(line) >= 3 and line[0] != '###' and line[0].isdigit()):
            event_time = current_time  # イベント発生時刻
            timestamp = event_time.strftime('%Y-%m-%d-%H-%M-%S.%f')
            line.insert(1, timestamp)
            print(line)
            
            # ローカルバックアップ（現在の日付のファイルに保存）
            f.write('\t'.join(line)+'\n')
            f.close()
            
            # サーバーにアップロード（バッファに追加）
            if len(line) >= 4:
                adc = line[0]
                vol = line[2] if len(line) > 2 else '0'
                deadtime = line[3] if len(line) > 3 else '0'
                uploader.add_data(timestamp, adc, vol, deadtime)
        else:
            # 無効なデータは表示してスキップ
            if line and line[0] != '###':
                print(f"Invalid data skipped: {line}")
            
except KeyboardInterrupt:
    print("\nStopping measurement...")
    uploader.stop_uploader()
    ser.close()
    print("Measurement stopped.")
    exit()