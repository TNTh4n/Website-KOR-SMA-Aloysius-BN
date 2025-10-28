// --- KONFIGURASI PENTING ---
const SHEET_ID = '1gAjNYTgbsGAMcVvk8-t7cD-ZrY7CFs4bNQowwnGY05Q';

// Variabel untuk menyimpan semua data dari Sheets agar tidak perlu fetch berulang
let cachedData = {};

// --- Fungsi Helper untuk Fetch Data dari Google Sheets ---
async function fetchSheetData(sheetName) {
    if (cachedData[sheetName]) {
        return cachedData[sheetName];
    }

    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${sheetName}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Gagal mengambil data sheet. Cek izin berbagi.');
        
        let text = await response.text();
        const jsonText = text.match(/google\.visualization\.Query\.setResponse\((.*)\);/s)[1];
        const data = JSON.parse(jsonText);
        
        const parsedData = parseGvizData(data.table);
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
    
    const headers = table.cols.map(col => col.label);
    return table.rows.map(row => {
        const item = {};
        row.c.forEach((cell, index) => {
            item[headers[index]] = cell ? cell.v : null; 
        });
        return item;
    });
}

// Fungsi untuk menangani format tanggal yang aneh dari Gviz (Versi Diperbarui)
function parseGvizDate(dateValue) {
    if (typeof dateValue === 'string' && dateValue.startsWith('Date(')) {
        const parts = dateValue.substring(5, dateValue.length - 1).split(',');
        if (parts.length >= 3) {
            return new Date(parts[0], parts[1], parts[2], parts[3] || 0, parts[4] || 0, parts[5] || 0);
        }
    }
    // Fallback untuk format string standar (jika ada)
    if (typeof dateValue === 'string') {
        const date = new Date(dateValue);
        if (!isNaN(date)) return date;
    }
    return null;
}


// --- 1. LEADERBOARD ---
async function loadLeaderboard() {
    const loader = document.getElementById('leaderboard-loader');
    const table = document.getElementById('leaderboard-table');
    const tbody = document.getElementById('leaderboard-body');
    
    const data = await fetchSheetData('Teams');
    
    if (data.length > 0) {
        const sortedData = data.map(row => {
            const p1 = parseInt(row['1st Place'] || 0);
            const p2 = parseInt(row['2nd Place'] || 0);
            const p3 = parseInt(row['3rd Place'] || 0);
            const p4 = parseInt(row['4th Place'] || 0);
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

// --- 2. BRACKET (DIMODIFIKASI) ---
let allSportsData = [];
let allBracketsData = [];
let allRaceData = []; // BARU: Simpan data balap

async function loadBracketData() {
    const sportSelect = document.getElementById('sport-select');
    
    // 1. Fetch data olahraga
    allSportsData = await fetchSheetData('Sports');
    
    if (allSportsData.length > 0) {
        sportSelect.innerHTML = '<option value="">-- Pilih Olahraga --</option>';
        allSportsData.forEach(sport => {
            // Pastikan 'Sport Name' tidak null atau undefined
            if(sport['Sport Name']) {
                sportSelect.innerHTML += `<option value="${sport['Sport Name']}">${sport['Sport Name']}</option>`;
            }
        });
    } else {
        sportSelect.innerHTML = '<option value="">Gagal memuat daftar olahraga</option>';
    }

    // 2. Fetch data bracket POHON
    allBracketsData = await fetchSheetData('Brackets');
    
    // 3. BARU: Fetch data bracket BALAP
    allRaceData = await fetchSheetData('RaceResults');

    // 4. Tambah event listener
    sportSelect.addEventListener('change', (e) => {
        renderBracketRouter(e.target.value); 
    });
}

// BARU: Fungsi Router untuk memilih tipe bracket
function renderBracketRouter(sportName) {
    const bracketTree = document.getElementById('bracket-main');
    const bracketRace = document.getElementById('bracket-race');
    const loader = document.getElementById('bracket-loader');

    if (!sportName) {
        bracketTree.style.display = 'none';
        bracketRace.style.display = 'none';
        loader.style.display = 'block';
        loader.innerText = 'Pilih olahraga untuk melihat bracket.';
        return;
    }

    // Cari tipe bracket dari data Sports
    const sportInfo = allSportsData.find(s => s['Sport Name'] === sportName);
    // Default ke 'Tree' jika 'Bracket Type' kosong atau tidak ditemukan
    const bracketType = (sportInfo && sportInfo['Bracket Type']) ? sportInfo['Bracket Type'] : 'Tree'; 

    loader.style.display = 'none';

    if (bracketType === 'Race') {
        // Tampilkan Bracket Balap
        bracketTree.style.display = 'none';
        bracketRace.style.display = 'block';
        renderRaceBracket(sportName); // Panggil fungsi balap baru
    } else {
        // Tampilkan Bracket Pohon (Logika lama)
        bracketRace.style.display = 'none';
        renderBracketTree(sportName); // Panggil fungsi pohon (logika lama)
    }
}

// FUNGSI LAMA (diganti nama): renderBracket -> renderBracketTree
function renderBracketTree(sportName) {
    const bracketMain = document.getElementById('bracket-main');
    const loader = document.getElementById('bracket-loader');

    const sportBrackets = allBracketsData.filter(match => match['Sport'] === sportName);
    
    if (sportBrackets.length === 0) {
        bracketMain.style.display = 'none';
        loader.style.display = 'block';
        loader.innerText = `Belum ada data bracket untuk ${sportName}.`;
        return;
    }

    loader.style.display = 'none';
    bracketMain.style.display = 'flex';
    
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

    // Isi semua match
    fillMatch('match-1', matchMap[1]);
    fillMatch('match-2', matchMap[2]);
    fillMatch('match-3', matchMap[3]);
    fillMatch('match-4', matchMap[4]);
    fillMatch('match-5', matchMap[5]); // Semi
    fillMatch('match-6', matchMap[6]); // Semi
    fillMatch('match-7', matchMap[7]); // 3rd Place
    fillMatch('match-8', matchMap[8]); // Final
    
    // Isi Winner
    const finalMatch = matchMap[8];
    const winnerEl = document.getElementById('match-winner');
    if (finalMatch && finalMatch['Winner']) {
        winnerEl.innerHTML = createTeamHTML(finalMatch['Winner'], null, true);
    } else {
        winnerEl.innerHTML = createTeamHTML(null);
    }
}


// --- FUNGSI BARU UNTUK BRACKET BALAP ---
function renderRaceBracket(sportName) {
    const loader = document.getElementById('bracket-loader');
    // 1. Filter data dari 'RaceResults'
    const results = allRaceData.filter(r => r['Sport'] === sportName);
    
    if (results.length === 0) {
        loader.style.display = 'block';
        loader.innerText = `Belum ada data hasil balap untuk ${sportName}. Cek sheet "RaceResults".`;
        return;
    }

    const r1Results = results.filter(r => r['Round'] == 1);
    const r2Results = results.filter(r => r['Round'] == 2);

    // 2. Helper untuk format waktu (ms ke detik)
    const formatTime = (ms) => {
        if (ms === null || isNaN(ms) || ms === 0) return "N/A";
        return (ms / 1000).toFixed(3) + "s";
    };

    // 3. Fungsi untuk mengisi tabel Round 1
    const populateRound1 = (grade, elementId) => {
        const table = document.getElementById(elementId);
        if (!table) return; // Pengaman jika ID tabel salah

        const gradeResults = r1Results
            .filter(r => r['Team Name'] && r['Team Name'].startsWith(grade))
            .sort((a, b) => (a['Time (ms)'] || Infinity) - (b['Time (ms)'] || Infinity)); // Urutkan berdasarkan waktu
        
        if (gradeResults.length === 0) {
            table.innerHTML = `<thead><tr><th>Tim</th><th>Waktu</th></tr></thead>
                               <tbody><tr><td colspan="2">Belum ada data.</td></tr></tbody>`;
            return;
        }

        table.innerHTML = `<thead><tr><th>Tim</th><th>Waktu</th></tr></thead><tbody></tbody>`;
        const tbody = table.querySelector('tbody');
        tbody.innerHTML = ''; // Kosongkan

        gradeResults.forEach((team, index) => {
            // Tandai pemenang (waktu tercepat & valid)
            const isWinner = index === 0 && (team['Time (ms)'] > 0);
            const winnerClass = isWinner ? 'class="race-winner"' : ''; 
            tbody.innerHTML += `
                <tr ${winnerClass}>
                    <td>${team['Team Name']}</td>
                    <td>${formatTime(team['Time (ms)'])}</td>
                </tr>
            `;
        });
    };

    // 4. Panggil fungsi untuk setiap angkatan
    populateRound1('Kelas X', 'race-round-X');
    populateRound1('Kelas XI', 'race-round-XI');
    populateRound1('Kelas XII', 'race-round-XII');

    // 5. Fungsi untuk mengisi tabel Final (Round 2)
    const tableFinal = document.getElementById('race-round-Final');
    if (!tableFinal) return;

    if (r2Results.length === 0) {
        tableFinal.innerHTML = `<thead><tr><th>Rank</th><th>Tim</th><th>Waktu</th></tr></thead>
                                <tbody><tr><td colspan="3">Menunggu hasil kualifikasi.</td></tr></tbody>`;
        return;
    }

    // Urutkan berdasarkan Rank (jika ada) atau Waktu
    const finalResults = r2Results.sort((a, b) => (a['Rank'] || 99) - (b['Rank'] || 99));

    tableFinal.innerHTML = `<thead><tr><th>Rank</th><th>Tim</th><th>Waktu</th></tr></thead><tbody></tbody>`;
    const tbodyFinal = tableFinal.querySelector('tbody');
    tbodyFinal.innerHTML = ''; // Kosongkan
    
    finalResults.forEach(team => {
        const rank = team['Rank'] || '-';
        const rankClass = `rank-${rank}`; // Untuk styling emas, perak, perunggu
        let rankIcon = rank;

        if (rank === 1) rankIcon = '🥇';
        if (rank === 2) rankIcon = '🥈';
        if (rank === 3) rankIcon = '🥉';

        tbodyFinal.innerHTML += `
            <tr class="${rankClass}">
                <td>${rankIcon}</td>
                <td>${team['Team Name']}</td>
                <td>${formatTime(team['Time (ms)'])}</td>
            </tr>
        `;
    });
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

    const data = await fetchSheetData('Schedule');
    
    if (data.length === 0) {
        loader.innerText = 'Gagal memuat data Schedule atau data kosong. Cek sheet "Schedule".';
        return;
    }
    
    // Menggunakan Waktu Lokal (Indonesia)
    const now = new Date();
    const today = now.toDateString();
    
    let todayMatches = [];
    let upcomingMatches = [];

    data.forEach(row => {
        const matchDateTime = parseGvizDate(row['Date']);
        
        if (!matchDateTime || isNaN(matchDateTime)) return; 

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
        
        // Cek jika Status adalah 'Cancelled'
        const isCancelled = (row['Status'] || '').toLowerCase() === 'cancelled';
        const statusStyle = isCancelled ? 'style="color: red; text-decoration: line-through;"' : '';

        const trToday = `
            <tr ${statusStyle}>
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
    
    const teams = await fetchSheetData('Teams');
    
    if (teams.length > 0) {
        teamSelect.innerHTML = '<option value="">-- Pilih Tim --</option>';
        teams.forEach(team => {
            const teamName = team['Team Name'];
            if (teamName) {
                teamSelect.innerHTML += `<option value="${teamName}">${teamName}</option>`;
            }
        });
    } else {
        teamSelect.innerHTML = '<option value="">Tidak ada data tim</option>';
    }
    
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
    
    const allRosters = await fetchSheetData('Rosters');
    const teamRoster = allRosters.filter(player => player['Team Name'] === teamName);
    
    rosterBody.innerHTML = ''; 
    
    if (teamRoster.length > 0) {
        teamRoster.forEach(player => {
            // Sesuai HTML Anda (Hanya 2 kolom)
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
    
    const data = await fetchSheetData('Sports');

    if (data.length > 0) {
        loader.style.display = 'none';
        container.innerHTML = '';
        data.forEach(sport => {
            const rulesLink = sport['Rules'] ? `<a href="${sport['Rules']}" target="_blank">Juknis</a>` : 'N/A';
            const card = `
                <div class="sport-card">
                    <img src="${sport['Image URL'] || 'https://via.placeholder.com/300x200?text=Sport'}" alt="${sport['Sport Name']}">
                    <div class="sport-card-content">
                        <h3>${sport['Sport Name'] || '-'}</h3>
                        <p><strong>Deskripsi:</strong> ${sport['Description'] || '-'}</p>
                        <p><strong>Aturan:</strong> ${rulesLink}</p>
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
    
    const data = await fetchSheetData('Gallery');
    
    if (data.length > 0) {
        loader.style.display = 'none';
        container.innerHTML = '';
        data.forEach(item => {
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
    loadBracketData(); // Ini memanggil fungsi bracket baru yang berisi router
    loadSchedule();
    loadCountdown();
    loadRoster(); 
    loadSportsInfo();
    loadGallery();
    
    // Smooth scroll untuk navigasi
    document.querySelectorAll('nav a').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetElement = document.querySelector(this.getAttribute('href'));
            if(targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
});
