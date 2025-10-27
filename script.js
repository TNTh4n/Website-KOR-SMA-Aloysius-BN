// --- KONFIGURASI PENTING ---
// ID ini HARUS SESUAI dengan link spreadsheet Anda
const SHEET_ID = '1gAjNYTgbsGAMcVvk8-t7cD-ZrY7CFs4bNQowwnGY05Q';

// Variabel untuk menyimpan semua data dari Sheets agar tidak perlu fetch berulang
let cachedData = {};

// --- Fungsi Helper untuk Fetch Data dari Google Sheets ---
async function fetchSheetData(sheetName) {
    // Cek cache, jika sudah ada, langsung kembalikan
    if (cachedData[sheetName]) {
        return cachedData[sheetName];
    }

    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${sheetName}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Gagal mengambil data sheet. Cek izin berbagi.');
        
        let text = await response.text();
        // Membersihkan JSONP wrapper dari Google
        const jsonText = text.match(/google\.visualization\.Query\.setResponse\((.*)\);/s)[1];
        const data = JSON.parse(jsonText);
        
        const parsedData = parseGvizData(data.table);
        // Simpan ke cache
        cachedData[sheetName] = parsedData; 
        return parsedData;

    } catch (error) {
        console.error(`Error fetching ${sheetName}:`, error);
        return [];
    }
}

// Fungsi parsing data Gviz
function parseGvizData(table) {
    if (!table || !table.rows || table.rows.length === 0) return [];
    
    // Menggunakan label kolom sebagai kunci objek
    const headers = table.cols.map(col => col.label);
    return table.rows.map(row => {
        const item = {};
        row.c.forEach((cell, index) => {
            // Ambil nilai 'v' (value) dari sel
            item[headers[index]] = cell ? cell.v : null; 
        });
        return item;
    });
}

// Fungsi untuk menangani format tanggal yang aneh dari Gviz
function parseGvizDate(dateValue) {
    // Asumsi format Gviz: "Date(YYYY,M,D,H,m,s)" (M adalah 0-indexed)
    if (typeof dateValue === 'string' && dateValue.startsWith('Date(')) {
        const parts = dateValue.substring(5, dateValue.length - 1).split(',');
        // Parts: [tahun, bulan (0-indexed), hari, jam, menit, detik]
        // Konstruksi Date object
        return new Date(parts[0], parts[1], parts[2], parts[3] || 0, parts[4] || 0, parts[5] || 0);
    }
    return null;
}

// --- 1. LEADERBOARD ---
async function loadLeaderboard() {
    const loader = document.getElementById('leaderboard-loader');
    const table = document.getElementById('leaderboard-table');
    const tbody = document.getElementById('leaderboard-body');
    
    // Nama sheet harus "Teams"
    const data = await fetchSheetData('Teams');
    
    if (data.length > 0) {
            // Sorting data berdasarkan Total Points (dari tertinggi ke terendah)
        const sortedData = data.map(row => {
            // Konversi ke integer, jika null anggap 0
            const p1 = parseInt(row['1st Place'] || 0);
            const p2 = parseInt(row['2nd Place'] || 0);
            const p3 = parseInt(row['3rd Place'] || 0);
            const p4 = parseInt(row['4th Place'] || 0);
            
            // Kalkulasi Poin: 1st=8, 2nd=6, 3rd=4, 4th=2
            const totalPoints = (p1 * 8) + (p2 * 6) + (p3 * 4) + (p4 * 2);
            
            return { ...row, totalPoints, p1, p2, p3, p4 };
        }).sort((a, b) => b.totalPoints - a.totalPoints);
        
        tbody.innerHTML = ''; 
        sortedData.forEach(row => {
            const tr = `
                <tr>
                    <td>${row['Team Name'] || '-'}</td>
                    <td>${row.p1}</td>
                    <td>${row.p2}</td>
                    <td>${row.p3}</td>
                    <td>${row.p4}</td>
                    <td>${row.totalPoints}</td>
                </tr>
            `;
            tbody.innerHTML += tr;
        });
        
        loader.style.display = 'none';
        table.style.display = 'table';
    } else {
        loader.innerText = 'Gagal memuat data Leaderboard atau data kosong. Cek sheet "Teams".';
    }
}

// --- 2. BRACKET ---
let allSportsData = [];
let allBracketsData = [];

async function loadBracketData() {
    const sportSelect = document.getElementById('sport-select');
    
    // 1. Fetch data olahraga untuk dropdown (Sheet: Sports)
    allSportsData = await fetchSheetData('Sports');
    
    if (allSportsData.length > 0) {
        sportSelect.innerHTML = '<option value="">-- Pilih Olahraga --</option>';
        allSportsData.forEach(sport => {
            sportSelect.innerHTML += `<option value="${sport['Sport Name']}">${sport['Sport Name']}</option>`;
        });
    } else {
        sportSelect.innerHTML = '<option value="">Gagal memuat daftar olahraga</option>';
    }

    // 2. Fetch semua data bracket (Sheet: Brackets)
    allBracketsData = await fetchSheetData('Brackets');
    
    // 3. Tambah event listener ke dropdown
    sportSelect.addEventListener('change', (e) => {
        renderBracket(e.target.value);
    });
}

function renderBracket(sportName) {
    const bracketMain = document.getElementById('bracket-main');
    const loader = document.getElementById('bracket-loader');

    if (!sportName) {
        bracketMain.style.display = 'none';
        loader.style.display = 'block';
        loader.innerText = 'Pilih olahraga untuk melihat bracket.';
        return;
    }

    // Filter data bracket berdasarkan nama olahraga
    const sportBrackets = allBracketsData.filter(match => match['Sport'] === sportName);
    
    if (sportBrackets.length === 0) {
        bracketMain.style.display = 'none';
        loader.style.display = 'block';
        loader.innerText = `Belum ada data bracket untuk ${sportName}.`;
        return;
    }

    loader.style.display = 'none';
    bracketMain.style.display = 'flex';
    
    // Kosongkan semua match
    for(let i=1; i<=8; i++) {
        const matchEl = document.getElementById(`match-${i}`);
        if (matchEl) matchEl.innerHTML = '';
    }
    const matchWinnerEl = document.getElementById('match-winner');
    if (matchWinnerEl) matchWinnerEl.innerHTML = '';

    // Map data ke match
    const matchMap = {};
    sportBrackets.forEach(match => {
        matchMap[match['Match Number']] = match;
    });
    
    // Fungsi helper untuk membuat HTML tim
    const createTeamHTML = (team, score, isWinner) => {
        if (!team) return '<div class="bracket-team">&nbsp;</div>';
        const winnerClass = isWinner ? 'winner' : '';
        return `
            <div class="bracket-team ${winnerClass}">
                <span class="team-name">${team}</span>
                <span class="team-score">${score !== null ? score : ''}</span>
            </div>
        `;
    };
    
    // Fungsi helper untuk mengisi match
    const fillMatch = (matchId, matchData) => {
        const matchEl = document.getElementById(`match-${matchId}`);
        if (!matchEl) return;

        if (!matchData) {
            matchEl.innerHTML = createTeamHTML(null) + createTeamHTML(null);
            return;
        }
        
        const winner = matchData['Winner'];
        const team1 = matchData['Team 1'];
        const team2 = matchData['Team 2'];
        const score1 = matchData['Score 1'];
        const score2 = matchData['Score 2'];

        matchEl.innerHTML = `
            ${createTeamHTML(team1, score1, winner === team1)}
            ${createTeamHTML(team2, score2, winner === team2)}
        `;
    };

    // Isi semua match (asumsi 8 pertandingan total)
    fillMatch(1, matchMap[1]);
    fillMatch(2, matchMap[2]);
    fillMatch(3, matchMap[3]);
    fillMatch(4, matchMap[4]);
    fillMatch(5, matchMap[5]); // Semi
    fillMatch(6, matchMap[6]); // Semi
    fillMatch(7, matchMap[7]); // 3rd Place
    fillMatch(8, matchMap[8]); // Final
    
    // Isi Winner
    const finalMatch = matchMap[8];
    if (finalMatch && finalMatch['Winner']) {
        document.getElementById('match-winner').innerHTML = createTeamHTML(finalMatch['Winner'], null, true);
    } else {
        document.getElementById('match-winner').innerHTML = createTeamHTML(null);
    }
}


// --- 3. SCHEDULE ---
async function loadSchedule() {
    const loader = document.getElementById('schedule-loader');
    const todayTbody = document.getElementById('schedule-body-today');
    const upcomingTbody = document.getElementById('schedule-body-upcoming');
    const todayTable = document.getElementById('schedule-table-today');
    const upcomingTable = document.getElementById('schedule-table-upcoming');
    const noToday = document.getElementById('no-matches-today');
    const noUpcoming = document.getElementById('no-matches-upcoming');

    // Nama sheet harus "Schedule"
    const data = await fetchSheetData('Schedule');
    
    if (data.length === 0) {
        loader.innerText = 'Gagal memuat data Schedule atau data kosong. Cek sheet "Schedule".';
        return;
    }
    
    const today = new Date().toDateString();
    const now = new Date();
    
    let todayMatches = [];
    let upcomingMatches = [];

    data.forEach(row => {
        // Gunakan fungsi helper untuk parsing tanggal dan waktu
        const matchDateTime = parseGvizDate(row['Date']);
        
        if (!matchDateTime || isNaN(matchDateTime)) return; // Skip jika tanggal tidak valid

        const displayDate = matchDateTime.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const displayTime = matchDateTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

        const trUpcoming = `
            <tr>
                <td>${displayDate}</td>
                <td>${displayTime}</td>
                <td>${row['Sport'] || '-'}</td>
                <td>${row['Team 1'] || '-'}</td>
                <td>${row['Team 2'] || '-'}</td>
                <td>${row['Venue'] || '-'}</td>
            </tr>
        `;
        
        const trToday = `
            <tr style="${row['Status'] == 'Cancelled' && matchDateTime.toDateString() === today ? 'color: red' : ''}">
                <td>${displayTime}</td>
                <td>${row['Sport'] || '-'}</td>
                <td>${row['Team 1'] || '-'}</td>
                <td>${row['Team 2'] || '-'}</td>
                <td>${row['Venue'] || '-'}</td>
                <td>${row['Status'] || '-'}</td>
            </tr>
        `;

        if (matchDateTime.toDateString() === today) {
            todayMatches.push(trToday);
        } else if (matchDateTime >= now) {
            upcomingMatches.push(trUpcoming);
        }
    });

    loader.style.display = 'none';

    if (todayMatches.length > 0) {
        todayTbody.innerHTML = todayMatches.join('');
        todayTable.style.display = 'table';
        noToday.style.display = 'none';
    } else {
        todayTable.style.display = 'none';
        noToday.style.display = 'block';
    }
    
    if (upcomingMatches.length > 0) {
        upcomingTbody.innerHTML = upcomingMatches.join('');
        upcomingTable.style.display = 'table';
        noUpcoming.style.display = 'none';
    } else {
        upcomingTable.style.display = 'none';
        noUpcoming.style.display = 'block';
    }
}

// --- 4. COUNTDOWN ---
let countdownIntervals = [];
async function loadCountdown() {
    const loader = document.getElementById('countdown-loader');
    const container = document.getElementById('countdown-container');
    
    // Nama sheet harus "Countdown"
    const data = await fetchSheetData('Countdown');
    
    if (data.length === 0) {
        loader.innerText = 'Gagal memuat data Countdown atau data kosong. Cek sheet "Countdown".';
        return;
    }

    loader.style.display = 'none';
    container.innerHTML = '';
    countdownIntervals.forEach(clearInterval); 
    countdownIntervals = [];

    data.forEach(row => {
        const eventName = row['Event Name'];
        const dateValue = row['Target Date (YYYY-MM-DD HH:mm:ss)']; 
        
        if (!dateValue) return;
        
        // Gunakan fungsi helper untuk parsing tanggal
        const targetDate = parseGvizDate(dateValue);

        if (isNaN(targetDate) || !targetDate) return;

        const item = document.createElement('div');
        item.className = 'countdown-item';
        item.innerHTML = `
            <h3>${eventName}</h3>
            <div class="countdown-timer" id="timer-${eventName.replace(/\s+/g, '-')}">
                --:--:--:--
            </div>
        `;
        container.appendChild(item);
        
        const timerEl = document.getElementById(`timer-${eventName.replace(/\s+/g, '-')}`);

        const interval = setInterval(() => {
            const now = new Date().getTime();
            const distance = targetDate - now;

            if (distance < 0) {
                timerEl.innerHTML = "EVENT BERLANGSUNG";
                clearInterval(interval);
                return;
            }

            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            timerEl.innerHTML = `${days}d ${hours}h ${minutes}m ${seconds}s`;
        }, 1000);
        countdownIntervals.push(interval);
    });
}

// --- 5. DAFTAR PEMAIN (ROSTER) ---
async function loadRoster() {
    const teamSelect = document.getElementById('team-select');
    const teamLoader = document.getElementById('roster-loader');
    
    // 1. Ambil data tim untuk dropdown (Sheet: Teams)
    const teams = await fetchSheetData('Teams');
    
    if (teams.length > 0) {
        teamSelect.innerHTML = '<option value="">-- Pilih Tim --</option>';
        // Gunakan nama tim dari sheet Teams
        teams.forEach(team => {
            const teamName = team['Team Name'];
            if (teamName) {
                teamSelect.innerHTML += `<option value="${teamName}">${teamName}</option>`;
            }
        });
    } else {
        teamSelect.innerHTML = '<option value="">Tidak ada data tim</option>';
    }
    
    // 2. Event listener untuk menampilkan pemain
    teamSelect.addEventListener('change', (e) => {
        renderRoster(e.target.value);
    });
    
    teamLoader.innerText = 'Pilih tim untuk melihat daftar pemain.';
}

async function renderRoster(teamName) {
    const rosterBody = document.getElementById('roster-body');
    const rosterTable = document.getElementById('roster-table');
    const teamLoader = document.getElementById('roster-loader');
    
    if (!teamName) {
        rosterTable.style.display = 'none';
        teamLoader.style.display = 'block';
        teamLoader.innerText = 'Pilih tim untuk melihat daftar pemain.';
        return;
    }
    
    // Nama sheet harus "Rosters"
    const allRosters = await fetchSheetData('Rosters');
    const teamRoster = allRosters.filter(player => player['Team Name'] === teamName);
    
    rosterBody.innerHTML = ''; 
    
    if (teamRoster.length > 0) {
        teamRoster.forEach(player => {
            const tr = `
                <tr>
                    <td>${player['Player Name'] || '-'}</td>
                    <td>${player['Class'] || '-'}</td>
                </tr>
            `;
            rosterBody.innerHTML += tr;
        });
        
        rosterTable.style.display = 'table';
        teamLoader.style.display = 'none';
    } else {
        rosterTable.style.display = 'none';
        teamLoader.style.display = 'block';
        teamLoader.innerText = `Tidak ada daftar pemain terdaftar untuk ${teamName}. Cek sheet "Rosters".`;
    }
}

// --- 6. SPORTS INFO ---
async function loadSportsInfo() {
    const loader = document.getElementById('sports-loader');
    const container = document.getElementById('sports-container');
    
    // Nama sheet harus "Sports"
    const data = await fetchSheetData('Sports');

    if (data.length > 0) {
        loader.style.display = 'none';
        container.innerHTML = '';
        data.forEach(sport => {
            const card = `
                <div class="sport-card">
                    <img src="${sport['Image URL'] || 'https://via.placeholder.com/300x200?text=Sport'}" alt="${sport['Sport Name']}">
                    <div class="sport-card-content">
                        <h3>${sport['Sport Name'] || '-'}</h3>
                        <p><strong>Deskripsi:</strong> ${sport['Description'] || '-'}</p>
                        <p><strong>Aturan:</strong> ${sport['Rules'] || '-'}</p>
                        <p><strong>Tim:</strong> ${sport['Number of Teams'] || '-'} | <strong>Durasi:</strong> ${sport['Duration'] || '-'}</p>
                        <p><strong>Kondisi Menang:</strong> ${sport['Winning Conditions'] || '-'}</p>
                    </div>
                </div>
            `;
            container.innerHTML += card;
        });
    } else {
        loader.innerText = 'Gagal memuat data Sports atau data kosong. Cek sheet "Sports".';
    }
}

// --- 7. GALLERY ---
async function loadGallery() {
    const loader = document.getElementById('gallery-loader');
    const container = document.getElementById('gallery-container');
    
    // Nama sheet harus "Gallery"
    const data = await fetchSheetData('Gallery');
    
    if (data.length > 0) {
        loader.style.display = 'none';
        container.innerHTML = '';
        data.forEach(item => {
            // Coba parsing tanggal dari Gviz, lalu format
            const dateObj = parseGvizDate(item['Date']);
            const date = dateObj ? dateObj.toLocaleDateString('id-ID') : '';

            const galleryItem = `
                <figure class="gallery-item">
                    <img src="${item['Image URL'] || 'https://via.placeholder.com/250x200?text=Image'}" alt="${item['Caption']}">
                    <figcaption>
                        ${item['Caption'] || ''}
                        <small style="display:block; margin-top: 5px;">${date}</small>
                    </figcaption>
                </figure>
            `;
            container.innerHTML += galleryItem;
        });
    } else {
        loader.innerText = 'Gagal memuat data Gallery atau data kosong. Cek sheet "Gallery".';
    }
}

// --- Inisialisasi Website ---
document.addEventListener('DOMContentLoaded', () => {
    loadLeaderboard();
    loadBracketData();
    loadSchedule();
    loadCountdown();
    loadRoster(); 
    loadSportsInfo();
    loadGallery();
    
    // Smooth scroll untuk navigasi
    document.querySelectorAll('nav a').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });
});
