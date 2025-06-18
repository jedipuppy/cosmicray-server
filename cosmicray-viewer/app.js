class CosmicRayViewer {
    constructor() {
        // プロキシ経由でAPIにアクセス（ポート番号不要）
        this.apiBaseUrl = '';
        this.currentId = null;
        this.currentFile = null;
        this.timeChart = null;
        this.adcChart = null;
        this.selectedFiles = new Set();
        this.allIds = []; // 全IDデータを保存
        this.map = null; // Leaflet map instance
        this.markers = []; // Map markers
        
        this.initEventListeners();
        this.initMap();
        this.loadIds();
    }
    
    initEventListeners() {
        document.getElementById('back-to-ids').addEventListener('click', () => {
            this.showScreen('id-selection');
            this.loadIds();
        });
        
        document.getElementById('back-to-files').addEventListener('click', () => {
            this.showScreen('file-selection');
            this.loadFiles(this.currentId);
        });
        
        document.getElementById('download-file').addEventListener('click', () => {
            this.downloadFile();
        });
        
        document.getElementById('select-all').addEventListener('click', () => {
            this.selectAllFiles();
        });
        
        document.getElementById('clear-selection').addEventListener('click', () => {
            this.clearSelection();
        });
        
        document.getElementById('bulk-download').addEventListener('click', () => {
            this.bulkDownload();
        });
        
        document.getElementById('id-search').addEventListener('input', (e) => {
            this.filterIds(e.target.value);
        });
    }
    
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.style.display = 'none';
        });
        document.getElementById(screenId).style.display = 'block';
    }
    
    async fetchApi(endpoint) {
        try {
            const response = await fetch(`${this.apiBaseUrl}${endpoint}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            this.showError(`Failed to fetch data: ${error.message}`);
            return null;
        }
    }
    
    initMap() {
        // 日本中心の地図を初期化
        this.map = L.map('map').setView([35.6762, 139.6503], 6);
        
        // OpenStreetMapタイルレイヤーを追加
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        }).addTo(this.map);
        
        console.log('Map initialized');
    }
    
    async loadIds() {
        const data = await this.fetchApi('/list-ids');
        if (!data) return;
        
        this.allIds = data.ids; // 全データを保存
        this.displayIds(this.allIds);
        this.updateMap(this.allIds);
    }
    
    displayIds(ids) {
        const idList = document.getElementById('id-list');
        
        if (ids.length === 0) {
            idList.innerHTML = '<div class=\"no-results\">No measurement IDs found</div>';
            return;
        }
        
        idList.innerHTML = ids.map(item => `
            <div class=\"list-group-item list-group-item-action id-card id-list-item\" onclick=\"viewer.selectId('${item.id}')\">
                <div class=\"d-flex justify-content-between align-items-center\">
                    <div class=\"flex-grow-1\">
                        <div class=\"d-flex align-items-center mb-1\">
                            <span class=\"fw-medium me-2\">${item.id}</span>
                            <small class=\"text-muted\">${item.config ? item.config.comment || 'No comment' : 'No config'}</small>
                        </div>
                        <div class=\"d-flex justify-content-between\">
                            <small class=\"text-muted\">
                                ${item.config && item.config.created_at ? 
                                    new Date(item.config.created_at).toLocaleString() : 
                                    'Unknown date'}
                            </small>
                            ${item.config && item.config.gps_latitude ? 
                                `<small class=\"text-muted\">📍 ${item.config.gps_latitude}, ${item.config.gps_longitude}</small>` : 
                                ''}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    filterIds(searchTerm) {
        if (!searchTerm.trim()) {
            this.displayIds(this.allIds);
            this.updateMap(this.allIds);
            return;
        }
        
        const filtered = this.allIds.filter(item => {
            const id = item.id.toLowerCase();
            const comment = item.config ? (item.config.comment || '').toLowerCase() : '';
            const search = searchTerm.toLowerCase();
            
            return id.includes(search) || comment.includes(search);
        });
        
        this.displayIds(filtered);
        this.updateMap(filtered);
    }
    
    updateMap(ids) {
        // 既存のマーカーをクリア
        this.markers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.markers = [];
        
        // GPS座標があるIDにマーカーを追加
        ids.forEach(item => {
            if (item.config && item.config.gps_latitude && item.config.gps_longitude) {
                const lat = parseFloat(item.config.gps_latitude);
                const lng = parseFloat(item.config.gps_longitude);
                
                if (!isNaN(lat) && !isNaN(lng)) {
                    const marker = L.marker([lat, lng])
                        .addTo(this.map)
                        .bindPopup(`
                            <div style="color: #333;">
                                <strong>${item.id}</strong><br>
                                ${item.config.comment || 'No comment'}<br>
                                <small>📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}</small><br>
                                <button onclick="viewer.selectId('${item.id}')" 
                                        style="margin-top: 5px; padding: 2px 8px; background: #667eea; color: white; border: none; border-radius: 3px; cursor: pointer;">
                                    View Data
                                </button>
                            </div>
                        `);
                    
                    // マーカークリック時にIDリストをハイライト
                    marker.on('click', () => {
                        this.highlightId(item.id);
                    });
                    
                    this.markers.push(marker);
                }
            }
        });
        
        // マーカーがある場合は地図をフィット
        if (this.markers.length > 0) {
            const group = new L.featureGroup(this.markers);
            this.map.fitBounds(group.getBounds().pad(0.1));
        }
    }
    
    highlightId(id) {
        // IDリストの該当項目をハイライト
        const listItems = document.querySelectorAll('.id-list-item');
        listItems.forEach(item => {
            item.classList.remove('highlighted');
        });
        
        const targetItem = Array.from(listItems).find(item => 
            item.onclick && item.onclick.toString().includes(id)
        );
        
        if (targetItem) {
            targetItem.classList.add('highlighted');
            targetItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    
    async selectId(id) {
        this.currentId = id;
        document.getElementById('selected-id').textContent = id;
        this.showScreen('file-selection');
        await this.loadFiles(id);
    }
    
    async loadFiles(id) {
        const data = await this.fetchApi(`/api/files/${id}`);
        if (!data) return;
        
        const fileList = document.getElementById('file-list');
        const configInfo = document.getElementById('config-info');
        
        // Show config info
        if (data.config) {
            configInfo.style.display = 'block';
            configInfo.innerHTML = `
                <strong>Configuration:</strong><br>
                Comment: ${data.config.comment || 'None'}<br>
                ${data.config.gps_latitude ? `GPS: ${data.config.gps_latitude}, ${data.config.gps_longitude}<br>` : ''}
                Created: ${new Date(data.config.created_at).toLocaleString()}
            `;
        }
        
        if (data.files.length === 0) {
            fileList.innerHTML = '<div class=\"alert alert-warning\">No data files found</div>';
            return;
        }
        
        // Show bulk actions
        document.getElementById('bulk-actions').style.display = 'block';
        
        fileList.innerHTML = data.files.map(file => `
            <div class=\"list-group-item list-group-item-action file-list-item\">
                <div class=\"d-flex align-items-center\">
                    <input type=\"checkbox\" class=\"file-checkbox\" value=\"${file.name}\" 
                           onchange=\"viewer.toggleFileSelection('${file.name}', this.checked)\">
                    <div class=\"flex-grow-1\" onclick=\"viewer.selectFile('${file.name}')\" style=\"cursor: pointer;\">
                        <div class=\"d-flex justify-content-between align-items-center\">
                            <div>
                                <span class=\"fw-medium\">${file.name}</span>
                                <small class=\"text-muted ms-2\">${(file.size / 1024).toFixed(1)} KB</small>
                            </div>
                            <div class=\"text-end\">
                                <small class=\"text-muted\">${new Date(file.mtime).toLocaleString()}</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    async selectFile(filename) {
        this.currentFile = filename;
        document.getElementById('current-file').textContent = `${this.currentId}/${filename}`;
        this.showScreen('data-visualization');
        await this.loadAndVisualizeData(this.currentId, filename);
    }
    
    async loadAndVisualizeData(id, filename) {
        const data = await this.fetchApi(`/api/data/${id}/${filename}`);
        if (!data) return;
        
        this.createTimeHistogram(data.data);
        this.createAdcHistogram(data.data);
        this.showStatistics(data.data);
    }
    
    createTimeHistogram(data) {
        const ctx = document.getElementById('time-histogram').getContext('2d');
        
        // Parse timestamps and convert to minutes from start
        const timePoints = [];
        data.forEach(point => {
            // Parse timestamp format: 2025-06-16-00-00-00.153211
            const timeStr = point.timestamp;
            const parts = timeStr.split('-');
            if (parts.length >= 6) {
                const year = parseInt(parts[0]);
                const month = parseInt(parts[1]) - 1; // Month is 0-indexed
                const day = parseInt(parts[2]);
                const hour = parseInt(parts[3]);
                const minute = parseInt(parts[4]);
                const second = parseFloat(parts[5]);
                
                const date = new Date(year, month, day, hour, minute, second);
                if (!isNaN(date.getTime())) {
                    timePoints.push(date);
                }
            }
        });
        
        if (timePoints.length === 0) {
            console.error('No valid timestamps found');
            return;
        }
        
        // Sort time points
        timePoints.sort((a, b) => a - b);
        
        const startTime = timePoints[0];
        const endTime = timePoints[timePoints.length - 1];
        const totalMinutes = Math.ceil((endTime - startTime) / (1000 * 60));
        
        // Group by minute intervals
        const minuteCounts = {};
        timePoints.forEach(timePoint => {
            const minutesFromStart = Math.floor((timePoint - startTime) / (1000 * 60));
            minuteCounts[minutesFromStart] = (minuteCounts[minutesFromStart] || 0) + 1;
        });
        
        // Create labels and data arrays
        const minutes = Array.from({length: Math.max(totalMinutes, 1)}, (_, i) => i);
        const counts = minutes.map(minute => minuteCounts[minute] || 0);
        const labels = minutes.map(minute => {
            const time = new Date(startTime.getTime() + minute * 60 * 1000);
            return time.toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'});
        });
        
        if (this.timeChart) {
            this.timeChart.destroy();
        }
        
        this.timeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Events per Minute',
                    data: counts,
                    backgroundColor: 'rgba(102, 126, 234, 0.3)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 2,
                    fill: true,
                    pointRadius: 1,
                    pointHoverRadius: 3
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Events per Minute'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Time'
                        },
                        ticks: {
                            maxTicksLimit: 10 // Limit number of x-axis labels
                        }
                    }
                }
            }
        });
    }
    
    createAdcHistogram(data) {
        const ctx = document.getElementById('adc-histogram').getContext('2d');
        
        // Process ADC data - データ形式: count, timestamp, vol, adc
        // ADC値は4列目（deadtime）
        const adcValues = data.map(point => parseInt(point.deadtime)).filter(val => !isNaN(val));
        
        if (adcValues.length === 0) {
            console.error('No valid ADC values found');
            return;
        }
        
        const min = Math.min(...adcValues);
        const max = Math.max(...adcValues);
        const binWidth = 4; // ビン幅を4に設定
        
        // ビン範囲を計算
        const minBin = Math.floor(min / binWidth) * binWidth;
        const maxBin = Math.ceil(max / binWidth) * binWidth;
        
        // ビン幅4で各ADC値の頻度をカウント
        const bins = {};
        adcValues.forEach(value => {
            const binCenter = Math.floor(value / binWidth) * binWidth;
            bins[binCenter] = (bins[binCenter] || 0) + 1;
        });
        
        // ADC値の範囲で配列作成（4刻み）
        const adcRange = [];
        const counts = [];
        for (let adc = minBin; adc <= maxBin; adc += binWidth) {
            adcRange.push(adc);
            counts.push(bins[adc] || 0);
        }
        
        if (this.adcChart) {
            this.adcChart.destroy();
        }
        
        this.adcChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: adcRange,
                datasets: [{
                    label: 'Frequency',
                    data: counts,
                    backgroundColor: 'rgba(168, 230, 207, 0.6)',
                    borderColor: 'rgba(86, 171, 47, 1)',
                    borderWidth: 1,
                    barPercentage: 1.0, // バーの幅を最大に
                    categoryPercentage: 1.0 // カテゴリの幅を最大に（隙間なし）
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        type: 'logarithmic',
                        beginAtZero: false,
                        min: 1,
                        title: {
                            display: true,
                            text: 'Frequency (log scale)'
                        },
                        ticks: {
                            callback: function(value, index, values) {
                                if (value === 1 || value === 10 || value === 100 || value === 1000 || value === 10000) {
                                    return value;
                                }
                                return '';
                            }
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'ADC Value'
                        },
                        ticks: {
                            maxTicksLimit: 15 // X軸の目盛り数を制限
                        }
                    }
                }
            }
        });
    }
    
    showStatistics(data) {
        const totalEvents = data.length;
        
        if (totalEvents === 0) {
            console.error('No data for statistics');
            return;
        }
        
        // Parse timestamps to calculate measurement time and rate
        const timePoints = [];
        data.forEach(point => {
            const timeStr = point.timestamp;
            const parts = timeStr.split('-');
            if (parts.length >= 6) {
                const year = parseInt(parts[0]);
                const month = parseInt(parts[1]) - 1;
                const day = parseInt(parts[2]);
                const hour = parseInt(parts[3]);
                const minute = parseInt(parts[4]);
                const second = parseFloat(parts[5]);
                
                const date = new Date(year, month, day, hour, minute, second);
                if (!isNaN(date.getTime())) {
                    timePoints.push(date);
                }
            }
        });
        
        let measurementTime = 0;
        let measurementRate = 0;
        
        if (timePoints.length >= 2) {
            timePoints.sort((a, b) => a - b);
            const startTime = timePoints[0];
            const endTime = timePoints[timePoints.length - 1];
            measurementTime = (endTime - startTime) / 1000; // seconds
            measurementRate = totalEvents / measurementTime;
        }
        
        // Get comment from the current ID's config
        const comment = this.getCurrentComment();
        
        console.log('Data sample:', data.slice(0, 3));
        
        const statsContainer = document.getElementById('data-stats');
        statsContainer.innerHTML = `
            <div class=\"col-md-3\">
                <div class=\"stat-card\">
                    <div class=\"stat-value\">${totalEvents}</div>
                    <div class=\"stat-label\">Total Events</div>
                </div>
            </div>
            <div class=\"col-md-3\">
                <div class=\"stat-card\">
                    <div class=\"stat-value\">${measurementTime > 0 ? (measurementTime / 60).toFixed(1) : '0'}</div>
                    <div class=\"stat-label\">Measurement Time (min)</div>
                </div>
            </div>
            <div class=\"col-md-3\">
                <div class=\"stat-card\">
                    <div class=\"stat-value\">${measurementRate > 0 ? measurementRate.toFixed(2) : '0'}</div>
                    <div class=\"stat-label\">Rate (/s)</div>
                </div>
            </div>
            <div class=\"col-md-3\">
                <div class=\"stat-card\">
                    <div class=\"stat-value\" style=\"font-size: 1.2rem; overflow-wrap: break-word;\">${comment || 'No comment'}</div>
                    <div class=\"stat-label\">Comment</div>
                </div>
            </div>
        `;
    }
    
    getCurrentComment() {
        // Get comment from the loaded config data
        const currentIdData = this.allIds.find(item => item.id === this.currentId);
        return currentIdData?.config?.comment || 'No comment';
    }
    
    downloadFile() {
        if (this.currentId && this.currentFile) {
            const url = `${this.apiBaseUrl}/api/download/${this.currentId}/${this.currentFile}`;
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.currentId}_${this.currentFile}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    }
    
    toggleFileSelection(filename, checked) {
        if (checked) {
            this.selectedFiles.add(filename);
        } else {
            this.selectedFiles.delete(filename);
        }
        this.updateSelectionUI();
    }
    
    selectAllFiles() {
        const checkboxes = document.querySelectorAll('.file-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
            this.selectedFiles.add(checkbox.value);
        });
        this.updateSelectionUI();
    }
    
    clearSelection() {
        const checkboxes = document.querySelectorAll('.file-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        this.selectedFiles.clear();
        this.updateSelectionUI();
    }
    
    updateSelectionUI() {
        const count = this.selectedFiles.size;
        document.getElementById('selected-count').textContent = `${count} files selected`;
        document.getElementById('bulk-download').disabled = count === 0;
    }
    
    bulkDownload() {
        if (this.selectedFiles.size === 0) return;
        
        // Download each selected file
        this.selectedFiles.forEach(filename => {
            const url = `${this.apiBaseUrl}/api/download/${this.currentId}/${filename}`;
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.currentId}_${filename}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
        
        // Clear selection after download
        this.clearSelection();
    }
    
    showError(message) {
        // Simple error display - you can enhance this
        alert(message);
    }
}

// Initialize the viewer when page loads
const viewer = new CosmicRayViewer();