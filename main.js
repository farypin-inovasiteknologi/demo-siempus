
const myButton = document.getElementById("btn-back-to-top");
window.onscroll = function () { scrollFunction(); };
function scrollFunction() {
    if (document.body.scrollTop > 100 || document.documentElement.scrollTop > 100) { myButton.style.display = "block"; } else { myButton.style.display = "none"; }
}
function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }


/* ========================================================
   ADAPTOR MULTI-TENANT (1 FRONTEND, BANYAK BACKEND)
======================================================== */

// 1. Buat "Buku Telepon" yang berisi daftar sekolah dan link Backend-nya masing-masing
const daftarSekolah = {
    "sman5tebo": "https://script.google.com/......",
    "demo": "https://script.google.com/macros/s/AKfycbzwf-sCZUQeY__rMUXQuV6fbm6XeQFgnqDkvFCHtLQa8UbB0A9yqFuj8h5IuBIi0B-S/exec"
};

// 2. Baca parameter ?id= dari URL browser
const urlParams = new URLSearchParams(window.location.search);
let tenantId = urlParams.get('id');

// 3. Jika pengguna tidak mengetik ?id= di URL, coba ingat ID terakhir dari memori browser
if (!tenantId) {
    tenantId = localStorage.getItem('siempus_tenant_id') || "demo"; // Default ke 'demo' jika kosong
}

// 4. Keamanan: Jika pengguna ganti URL sekolah (pindah sekolah), logout otomatis akun sebelumnya
const savedTenant = localStorage.getItem('siempus_tenant_id');
if (savedTenant && savedTenant !== tenantId) {
    localStorage.removeItem('siempus_user');
    localStorage.removeItem('siempus_username');
    localStorage.removeItem('siempus_page');
}

// Simpan ID sekolah saat ini ke ingatan browser
localStorage.setItem('siempus_tenant_id', tenantId);

// 5. Tentukan API URL berdasarkan ID. Jika ID ngawur, kembalikan ke default 'demo'
let API_URL = daftarSekolah[tenantId];
if (!API_URL) {
    console.warn("Kode sekolah tidak terdaftar! Menggunakan server demo.");
    tenantId = "demo";
    API_URL = daftarSekolah["demo"];
    localStorage.setItem('siempus_tenant_id', tenantId);
}

// (Opsional) Rapikan URL di browser agar selalu terlihat ?id=namasekolah
if (!window.location.search.includes('id=')) {
    window.history.replaceState(null, null, "?id=" + tenantId);
}


function apiHelper() {
    let successCb = null;
    let failCb = null;

    const execute = async (action, payload = {}) => {
        payload.action = action;

        try {
            const res = await fetch(API_URL, {
                redirect: 'follow',
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (successCb) successCb(data);
        } catch (err) {
            if (failCb) failCb(err);
        }
    };

    return {
        withFailureHandler: function (cb) { failCb = cb; return this; },
        withSuccessHandler: function (cb) { successCb = cb; return this; },

        getAppConfig: function () { execute('getAppConfig'); },
        loginUser: function (u, p) { execute('loginUser', { username: u, password: p }); },
        checkMember: function (id) { execute('checkMember', { id: id }); },
        prosesPeminjaman: function (m, b, p) { execute('prosesPeminjaman', { idAnggota: m, kodeBuku: b, petugas: p }); },
        prosesPengembalian: function (m, b, p) { execute('prosesPengembalian', { idAnggota: m, kodeBuku: b, petugas: p }); },
        getBookList: function (p, l, q) { execute('getBookList', { page: p, limit: l, search: q }); },
        saveBook: function (d) { execute('saveBook', { bookData: d }); },
        deleteBook: function (k) { execute('deleteBook', { kode: k }); },
        getMemberList: function (p, l, q) { execute('getMemberList', { page: p, limit: l, search: q }); },
        saveMember: function (d) { execute('saveMember', { memberData: d }); },
        deleteMember: function (id) { execute('deleteMember', { id: id }); },
        getDashboardStats: function () { execute('getDashboardStats'); },
        getHistoryList: function (p, l, q, isA) { execute('getHistoryList', { page: p, limit: l, search: q, isArchive: isA }); },
        saveAppConfig: function (d) { execute('saveAppConfig', { configData: d }); },
        updateUserCredentials: function (o, n, p) { execute('updateUserCredentials', { oldUser: o, newUser: n, newPass: p }); },
        processExcelData: function (t, r) { execute('processExcelData', { type: t, rows: r }); },
        getExportHistoryByDate: function (s, e, a) { execute('getExportHistoryByDate', { startDate: s, endDate: e, isArchive: a }); },
        deleteHistory: function (id, isA) { execute('deleteHistory', { idTrx: id, isArchive: isA }); },
        getAllDataForExport: function (type) { execute('getAllDataForExport', { type: type }); },
        callGeminiAI: function (p) { execute('callGeminiAI', { prompt: p }); }
    };
}

const google = { get script() { return { get run() { return apiHelper(); } } } };

/* ========================================================
   GLOBAL VARIABLES & TOOLS
======================================================== */
let currentUser = null;
let currentUsername = null;
let bookData = [], memberData = [], historyData = [];
let bookPage = 1, memberPage = 1, historyPage = 1;
let bookTotal = 0, memberTotal = 0, historyTotal = 0;
let rowsPerPage = 10;
let importType = '';
let html5QrcodeScanner = null;
let globalLogoUrl = '';
let globalLogoBase64 = '';
let searchTimeout = null;

let cropperInstance = null;
let currentCropTarget = '';
let uploadBgBase64 = null;
let uploadLogoBase64 = null;
let uploadLogoInstansiBase64 = null;

// --- FITUR BARU: ANIMASI LOADING HITUNG MUNDUR ---
let swalCountdownInterval;
function showSmartLoading(title, desc) {
    let timer = 7;
    Swal.fire({
        title: title,
        html: `
            <div class="mb-3 text-secondary" style="font-size: 0.9rem;">${desc}</div>
            <div id="swal-timer-wrapper" class="badge bg-primary shadow-sm fs-6 px-3 py-2 rounded-pill">
                <i class="fas fa-stopwatch me-1"></i> <span id="swal-timer">${timer}</span> detik
            </div>
        `,
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
            if (swalCountdownInterval) clearInterval(swalCountdownInterval);
            swalCountdownInterval = setInterval(() => {
                timer--;
                const timerEl = document.getElementById('swal-timer');
                const wrapperEl = document.getElementById('swal-timer-wrapper');
                if (timer > 0) {
                    if (timerEl) timerEl.innerText = timer;
                } else {
                    clearInterval(swalCountdownInterval);
                    if (wrapperEl) {
                        wrapperEl.className = "badge bg-warning text-dark shadow-sm fs-6 px-3 py-2 rounded-pill";
                        wrapperEl.innerHTML = '<i class="fas fa-cog fa-spin me-1"></i> Data sedang diproses...';
                    }
                }
            }, 1000);
        },
        willClose: () => {
            if (swalCountdownInterval) clearInterval(swalCountdownInterval);
        }
    });
}

const handleNetworkError = (err) => {
    console.error(err);
    if (swalCountdownInterval) clearInterval(swalCountdownInterval);
    Swal.close();
    document.querySelectorAll('.spinner-border, .spinner-grow').forEach(el => el.parentElement.classList.add('d-none'));
    Swal.fire('Koneksi Gagal', 'Terjadi kesalahan jaringan atau server lambat. Pastikan internet Anda stabil lalu coba lagi.', 'error');
};

function safeIsoDate(val) {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function safeDisplayDate(val) {
    if (!val) return '-';
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function injectRefreshBtn(pageId, callback) {
    const header = document.querySelector(`#${pageId} h5`);
    if (header && !header.querySelector('.btn-refresh')) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-light text-primary ms-2 btn-refresh rounded-circle';
        btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
        btn.title = "Refresh Data";
        btn.style.width = '30px';
        btn.style.height = '30px';
        btn.onclick = () => {
            const icon = btn.querySelector('i');
            icon.classList.add('fa-spin');
            callback();
            setTimeout(() => icon.classList.remove('fa-spin'), 1000);
        };
        header.appendChild(btn);
    }
}

function injectHistoryTools() {
    const headerRow = document.querySelector('#page-riwayat .d-flex.justify-content-between');
    if (headerRow) {
        const toolsDiv = document.createElement('div');
        toolsDiv.className = 'd-flex align-items-center gap-2';

        if (!document.getElementById('chkArsip')) {
            const divArsip = document.createElement('div');
            divArsip.className = 'form-check form-switch m-0';
            divArsip.innerHTML = '<input class="form-check-input" type="checkbox" id="chkArsip" onchange="loadHistory()"><label class="form-check-label small fw-bold" for="chkArsip">Arsip</label>';
            toolsDiv.appendChild(divArsip);
        }

        if (!document.getElementById('btnExportRiwayat')) {
            const btnEx = document.createElement('button');
            btnEx.id = 'btnExportRiwayat';
            btnEx.className = 'btn btn-sm btn-success fw-bold';
            btnEx.innerHTML = '<i class="fas fa-file-excel me-1"></i> Export';
            btnEx.onclick = openExportHistoryModal;
            toolsDiv.appendChild(btnEx);
        }
        const searchInput = headerRow.querySelector('input');
        if (searchInput) {
            headerRow.insertBefore(toolsDiv, searchInput);
            searchInput.classList.remove('w-100');
        }
    }
}

function openExportHistoryModal() {
    Swal.fire({
        title: 'Export Riwayat',
        html: '<div class="text-start"><label class="small fw-bold">Dari Tanggal</label><input type="date" id="expStart" class="form-control mb-2"><label class="small fw-bold">Sampai Tanggal</label><input type="date" id="expEnd" class="form-control"><div class="mt-2 small text-muted"><i class="fas fa-info-circle"></i> Data diambil sesuai mode (Aktif/Arsip)</div></div>',
        showCancelButton: true,
        confirmButtonText: 'Download Excel',
        confirmButtonColor: '#198754',
        preConfirm: () => {
            const s = document.getElementById('expStart').value;
            const e = document.getElementById('expEnd').value;
            if (!s || !e) { Swal.showValidationMessage('Tanggal harus diisi lengkap'); return false; }
            if (s > e) { Swal.showValidationMessage('Tanggal mulai tidak boleh lebih besar dari akhir'); return false; }
            return { s, e };
        }
    }).then((result) => {
        if (result.isConfirmed) processExportHistory(result.value.s, result.value.e);
    });
}

function processExportHistory(start, end) {
    const isArchive = document.getElementById('chkArsip').checked;
    showSmartLoading('Menyiapkan Data...', 'Sedang merangkum riwayat dari server.');

    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(data => {
            if (data.length === 0) {
                Swal.fire('Kosong', 'Tidak ada data transaksi.', 'info');
                return;
            }
            const headers = ["ID Transaksi", "ID Anggota", "Kode Buku", "Tgl Pinjam", "Jatuh Tempo", "Tgl Kembali", "Status", "Denda", "Petugas"];
            const fileName = `Laporan_${start}_sd_${end}${isArchive ? '_Arsip' : ''}.xlsx`;
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
            XLSX.utils.book_append_sheet(wb, ws, "Riwayat");
            XLSX.writeFile(wb, fileName);
            Swal.close();
        }).getExportHistoryByDate(start, end, isArchive);
}

// --- LOGIKA CROPPER ---
document.getElementById('fileLogo').addEventListener('change', function (e) { openCropper(e, 'logo', 1 / 1); });
document.getElementById('fileLogoInstansi').addEventListener('change', function (e) { openCropper(e, 'logoInstansi', 1 / 1); });
document.getElementById('fileBg').addEventListener('change', function (e) { openCropper(e, 'bg', 5 / 3); });

function openCropper(e, target, ratio) {
    const file = e.target.files[0];
    if (!file) return;
    currentCropTarget = target;
    const reader = new FileReader();
    reader.onload = function (event) {
        const img = document.getElementById('imageToCrop');
        img.src = event.target.result;
        const cropModal = new bootstrap.Modal(document.getElementById('modalCrop'));
        cropModal.show();
        document.getElementById('modalCrop').addEventListener('shown.bs.modal', function () {
            if (cropperInstance) cropperInstance.destroy();
            cropperInstance = new Cropper(img, { aspectRatio: ratio, viewMode: 1, autoCropArea: 1 });
        }, { once: true });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

document.getElementById('btnApplyCrop').addEventListener('click', function () {
    if (!cropperInstance) return;
    if (currentCropTarget === 'logo' || currentCropTarget === 'logoInstansi') {
        const canvas = cropperInstance.getCroppedCanvas({ width: 400, height: 400 });
        const resultBase64 = canvas.toDataURL('image/png');
        if (currentCropTarget === 'logo') {
            uploadLogoBase64 = resultBase64;
            document.getElementById('previewLogo').src = uploadLogoBase64; document.getElementById('previewLogo').style.display = 'block';
        } else {
            uploadLogoInstansiBase64 = resultBase64;
            document.getElementById('previewLogoInstansi').src = uploadLogoInstansiBase64; document.getElementById('previewLogoInstansi').style.display = 'block';
        }
    } else {
        const canvas = cropperInstance.getCroppedCanvas({ width: 1280, height: 768 });
        uploadBgBase64 = canvas.toDataURL('image/jpeg', 0.8);
        document.getElementById('previewBg').src = uploadBgBase64; document.getElementById('previewBg').style.display = 'block';
    }
    bootstrap.Modal.getInstance(document.getElementById('modalCrop')).hide();
});

// --- INIT APP (SUPER AMAN ANTI-LOGOUT SAAT RELOAD) ---
document.addEventListener("DOMContentLoaded", function () {
    const savedUser = localStorage.getItem('siempus_user');
    const savedUname = localStorage.getItem('siempus_username');
    const savedPage = localStorage.getItem('siempus_page');

    // Logika verifikasi yang ketat (Tolak jika null, teks "null", atau kosong)
    if (savedUser && savedUser !== "null" && savedUser !== "undefined" && savedUser.trim() !== "") {

        // --- BERHASIL DETEKSI SESI LOGIN ---
        currentUser = savedUser;
        currentUsername = savedUname;
        document.getElementById('user-display-name').textContent = currentUser;

        // Hapus paksa elemen login
        const loginApp = document.getElementById('login-app');
        loginApp.classList.remove('d-flex');
        loginApp.classList.add('d-none');

        // Munculkan aplikasi utama
        document.getElementById('main-app').classList.remove('d-none');
        showPage(savedPage);
        setupEnterKeys();

    } else {
        // --- JIKA BELUM LOGIN / DATA KOSONG ---
        const loginApp = document.getElementById('login-app');
        loginApp.classList.remove('d-none');
        loginApp.classList.add('d-flex');
        document.getElementById('main-app').classList.add('d-none');
    }

    // Memuat Pengaturan dari Database
    loadAppConfig();
    initDropdownKelas();

    const toggleBtn = document.getElementById('btn-toggle-menu');
    if (toggleBtn) {
        toggleBtn.onclick = () => {
            document.getElementById('sidebar').classList.toggle('show');
            document.getElementById('overlay').classList.toggle('show');
        };
        document.getElementById('overlay').onclick = () => {
            document.getElementById('sidebar').classList.remove('show');
            document.getElementById('overlay').classList.remove('show');
        };
    }

    injectRefreshBtn('page-dashboard', loadDashboard);
    injectRefreshBtn('page-buku', () => { bookPage = 1; loadBooks(); });
    injectRefreshBtn('page-anggota', () => { memberPage = 1; loadMembers(); });
    injectRefreshBtn('page-riwayat', () => { historyPage = 1; loadHistory(); });

    injectSearchBox('page-buku', 'Cari Buku...', (q) => { bookPage = 1; loadBooks(q); });
    injectSearchBox('page-anggota', 'Cari Anggota...', (q) => { memberPage = 1; loadMembers(q); });
    setupSearchListener('searchRiwayat', (q) => { historyPage = 1; loadHistory(q); });

    injectHistoryTools();

    const riwayatHeader = document.querySelector('#page-riwayat .d-flex.justify-content-between');
    if (riwayatHeader && !document.getElementById('chkArsip')) {
        const div = document.createElement('div');
        div.className = 'form-check form-switch ms-3';
        div.innerHTML = '<input class="form-check-input" type="checkbox" id="chkArsip" onchange="loadHistory()"><label class="form-check-label small fw-bold" for="chkArsip">Lihat Arsip Lama</label>';
        riwayatHeader.appendChild(div);
    }
});

function injectSearchBox(pageId, placeholder, callback) {
    const container = document.querySelector(`#${pageId} .d-flex.flex-column`);
    if (container && !container.querySelector('.custom-search')) {
        const div = document.createElement('div');
        div.className = 'w-100 w-md-25 custom-search';
        div.innerHTML = `<input type="text" class="form-control form-control-sm" placeholder="${placeholder}">`;
        const input = div.querySelector('input');
        input.addEventListener('keyup', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => { callback(e.target.value); }, 600);
        });
        container.insertBefore(div, container.lastElementChild);
    }
}

function setupSearchListener(id, callback) {
    const el = document.getElementById(id);
    if (el) {
        el.removeAttribute('onkeyup');
        el.addEventListener('keyup', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => { callback(e.target.value); }, 600);
        });
    }
}

function setupEnterKeys() {
    const addEnter = (id, func) => {
        const el = document.getElementById(id);
        if (el) { el.addEventListener("keypress", function (event) { if (event.key === "Enter") { event.preventDefault(); func(); } }); }
    };
    addEnter('loan-member-input', () => handleManualMember('loan'));
    addEnter('loan-book-input', () => handleManualBook('loan'));
    addEnter('return-member-input', () => handleManualMember('return'));
    addEnter('return-book-input', () => handleManualBook('return'));
    addEnter('uPass', attemptLogin);
}

function loadAppConfig() {
    google.script.run
        .withFailureHandler(err => console.log("Gagal memuat config:", err))
        .withSuccessHandler(cfg => {
            const logoSrc = cfg.UrlLogo || cfg.LogoBase64;
            const bgSrc = cfg.UrlBackground;
            const logoInstansiSrc = cfg.UrlLogoInstansi;

            const fallback = 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png';
            if (logoSrc) {
                globalLogoUrl = logoSrc;
                const l2 = document.getElementById('sidebar-logo'); const l3 = document.getElementById('login-logo-sekolah');
                if (l2) { l2.src = logoSrc; l2.onerror = () => l2.src = fallback; }
                if (l3) { l3.src = logoSrc; l3.onerror = () => l3.src = fallback; }
                const pLogo = document.getElementById('previewLogo'); if (pLogo && logoSrc.length > 5) { pLogo.src = logoSrc; pLogo.style.display = 'block'; }
                const mLogo = document.getElementById('mobile-logo-img'); if (mLogo) { mLogo.src = logoSrc; mLogo.onerror = () => mLogo.src = fallback; }
            }

            if (logoInstansiSrc) {
                const lInstansi = document.getElementById('login-logo-instansi');
                if (lInstansi) { lInstansi.src = logoInstansiSrc; lInstansi.onerror = () => lInstansi.src = fallback; }
                const pLogoIns = document.getElementById('previewLogoInstansi'); if (pLogoIns && logoInstansiSrc.length > 5) { pLogoIns.src = logoInstansiSrc; pLogoIns.style.display = 'block'; }
            }

            if (cfg.NamaSekolah) {
                const n1 = document.getElementById('login-school-name'); const n2 = document.getElementById('sidebar-school-name'); const mText = document.getElementById('mobile-school-text');
                if (n1) n1.textContent = cfg.NamaSekolah; if (n2) n2.textContent = cfg.NamaSekolah; if (mText) mText.textContent = cfg.NamaSekolah;
                document.title = cfg.NamaSekolah + ' - Library';
            }

            if (cfg.NamaInstansi) {
                const insText = document.getElementById('login-instansi-name');
                if (insText) insText.textContent = cfg.NamaInstansi;
            }

            if (cfg.AlamatSekolah) {
                const alamatText = document.getElementById('login-alamat-text');
                if (alamatText) alamatText.textContent = cfg.AlamatSekolah;
            }

            const namaSekolahFooter = cfg.NamaSekolah || 'Sistem E Manajemen Perpustakaan Sekolah';
            const footerTeksOtomatis = `© 2026 SiE-MPuS ${namaSekolahFooter}. Hak Cipta Dilindungi.`;
            const f1 = document.getElementById('login-footer-text'); const f2 = document.getElementById('sidebar-footer-text');
            if (f1) f1.innerHTML = footerTeksOtomatis; if (f2) f2.innerHTML = footerTeksOtomatis;

            const btnWin = document.getElementById('btn-dl-win'); const btnAnd = document.getElementById('btn-dl-and');
            if (btnWin && cfg.UrlWindows && cfg.UrlWindows.length > 5) { btnWin.href = cfg.UrlWindows; btnWin.classList.remove('d-none'); }
            if (btnAnd && cfg.UrlAndroid && cfg.UrlAndroid.length > 5) { btnAnd.href = cfg.UrlAndroid; btnAnd.classList.remove('d-none'); }

            if (cfg.RunningText) { const rt = document.getElementById('login-running-text'); if (rt) rt.textContent = cfg.RunningText; }
            if (bgSrc) { const la = document.getElementById('login-app'); if (la) la.style.backgroundImage = `url('${bgSrc}')`; const pBg = document.getElementById('previewBg'); if (pBg && bgSrc.length > 5) { pBg.src = bgSrc; pBg.style.display = 'block'; } }
        }).getAppConfig();
}

function switchLoginPanel(direction) {
    const leftPanel = document.getElementById('panel-left-mobile');
    const rightPanel = document.getElementById('panel-right-mobile');
    if (direction === 'right') {
        leftPanel.classList.add('d-none');
        leftPanel.classList.remove('d-flex');
        rightPanel.classList.remove('d-none');
        rightPanel.classList.add('d-flex');
    } else {
        rightPanel.classList.add('d-none');
        rightPanel.classList.remove('d-flex');
        leftPanel.classList.remove('d-none');
        leftPanel.classList.add('d-flex');
    }
}

// ==========================================================
// 👁️ FITUR TOMBOL MATA (LIHAT PASSWORD)
// ==========================================================

// 1. Tombol Mata di Halaman Login
function togglePassword() {
    const passInput = document.getElementById('uPass');
    const icon = document.getElementById('eyeIcon');

    if (!passInput || !icon) return; // Mencegah error jika elemen tidak ditemukan

    if (passInput.type === 'password') {
        passInput.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        passInput.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// 2. Tombol Mata di Halaman Pengaturan (Ubah Password Admin)
function toggleAdminPassword() {
    const passInput = document.getElementById('accPass');
    const icon = document.getElementById('eyeIconAdmin');

    if (!passInput || !icon) return; // Mencegah error jika elemen tidak ditemukan

    if (passInput.type === 'password') {
        passInput.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        passInput.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function attemptLogin() {
    const u = document.getElementById('uName').value;
    const p = document.getElementById('uPass').value;
    const btn = document.getElementById('btnLogin');
    if (!u || !p) { Swal.fire('Peringatan', 'Isi semua data', 'warning'); return; }

    btn.innerHTML = 'Loading...'; btn.disabled = true;

    // --- CEK OFFLINE LOGIN ATAU APLIKASI DESKTOP ---
    const isDesktop = (typeof process !== 'undefined' && process.versions && process.versions.electron);
    if (!navigator.onLine || isDesktop) {
        setTimeout(() => { // Simulasi loading sedikit
            // Membaca dari config_offline.js jika tersedia
            let offUser = (typeof OFFLINE_ADMIN_USER !== 'undefined') ? OFFLINE_ADMIN_USER : 'admin';
            let offPass = (typeof OFFLINE_ADMIN_PASS !== 'undefined') ? OFFLINE_ADMIN_PASS : 'admin123';

            if (u === offUser && p === offPass) {
                prosesSuksesLogin({ status: true, nama: 'Admin (Mode Offline)', username: u });
            } else {
                btn.innerHTML = 'Login Sistem'; btn.disabled = false;
                Swal.fire('Gagal (Mode Offline)', 'Username atau Password salah. (Pastikan config_offline.js sudah benar)', 'error');
            }
        }, 800);
        return; // Jangan lanjut panggil API online
    }
    // -------------------------

    google.script.run
        .withFailureHandler(err => {
            btn.innerHTML = 'Login Sistem'; btn.disabled = false;
            handleNetworkError(err);
        })
        .withSuccessHandler(res => {
            if (res.status) {
                prosesSuksesLogin(res);
            } else {
                btn.innerHTML = 'Login Sistem'; btn.disabled = false;
                Swal.fire('Gagal', res.message, 'error');
            }
        }).loginUser(u, p);
}

function prosesSuksesLogin(res) {
    const btn = document.getElementById('btnLogin');
    btn.innerHTML = 'Login Sistem'; btn.disabled = false;

    // Pastikan nama tidak kosong, jika kosong gunakan username
    currentUser = (res.nama && res.nama.trim() !== "") ? res.nama : res.username;
    currentUsername = res.username;

    localStorage.setItem('siempus_user', currentUser);
    localStorage.setItem('siempus_username', currentUsername);
    localStorage.setItem('siempus_page', 'dashboard'); // Langsung kunci ke dashboard saat awal login

    document.getElementById('user-display-name').textContent = currentUser;

    // Hilangkan form login
    const loginApp = document.getElementById('login-app');
    loginApp.classList.remove('d-flex');
    loginApp.classList.add('d-none');

    // Tampilkan halaman utama
    document.getElementById('main-app').classList.remove('d-none');
    showPage('dashboard');
    setupEnterKeys();
}

document.getElementById('nav-logout').addEventListener('click', () => {
    Swal.fire({
        title: 'Keluar?', icon: 'question', showCancelButton: true, confirmButtonText: 'Ya', confirmButtonColor: '#d33'
    }).then((r) => {
        if (r.isConfirmed) {
            localStorage.removeItem('siempus_user');
            localStorage.removeItem('siempus_username');
            localStorage.removeItem('siempus_page');
            currentUser = null;
            currentUsername = null;
            document.getElementById('uName').value = '';
            document.getElementById('uPass').value = '';
            stopScanner();
            document.getElementById('sidebar').classList.remove('show');
            document.getElementById('overlay').classList.remove('show');
            document.getElementById('main-app').classList.add('d-none');
            const loginApp = document.getElementById('login-app');
            loginApp.classList.remove('d-none');
            loginApp.classList.add('d-flex');
            const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
            Toast.fire({ icon: 'success', title: 'Berhasil keluar' });
        }
    });
});

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        this.classList.add('active');
        document.getElementById('sidebar').classList.remove('show');
        document.getElementById('overlay').classList.remove('show');
        showPage(this.id.replace('nav-', ''));
    });
});

function showPage(pageId) {
    // Fallback keamanan jika memori browser rusak/kosong
    if (!pageId || pageId === "null" || pageId === "undefined" || pageId.trim() === "") {
        pageId = 'dashboard';
    }

    localStorage.setItem('siempus_page', pageId);
    document.querySelectorAll('.page-section').forEach(p => p.classList.add('d-none'));

    // Cari target halaman, jika tidak ketemu, paksa ke dashboard (mencegah JS Crash)
    const targetPage = document.getElementById('page-' + pageId);
    if (targetPage) {
        targetPage.classList.remove('d-none');
    } else {
        document.getElementById('page-dashboard').classList.remove('d-none');
        pageId = 'dashboard';
        localStorage.setItem('siempus_page', 'dashboard');
    }

    // Sinkronisasi menu samping (Sidebar)
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const activeSidebar = document.getElementById('nav-' + pageId);
    if (activeSidebar) activeSidebar.classList.add('active');

    // Sinkronisasi menu bawah (HP)
    if (typeof updateMobileNav === "function") { updateMobileNav(pageId); }

    const titles = {
        'dashboard': 'Dashboard Admin', 'peminjaman': 'Peminjaman', 'pengembalian': 'Pengembalian',
        'riwayat': 'Riwayat Transaksi', 'buku': 'Data Buku', 'anggota': 'Data Anggota', 'pengaturan': 'Pengaturan Sistem'
    };
    document.getElementById('page-title').textContent = titles[pageId] || 'Dashboard';
    stopScanner();

    if (pageId === 'dashboard') loadDashboard();
    if (pageId === 'buku') { bookPage = 1; loadBooks(); }
    if (pageId === 'anggota') { memberPage = 1; loadMembers(); }
    if (pageId === 'riwayat') {
        historyPage = 1;
        const chk = document.getElementById('chkArsip');
        if (chk) chk.checked = false;
        loadHistory();
    }
    if (pageId === 'pengaturan') loadSettingsForm();
    if (pageId === 'peminjaman') startScanner('loan');
    else if (pageId === 'pengembalian') startScanner('return');
}

let scanLock = false;

function playBeep() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = 1200;
        gain.gain.value = 0.3;
        osc.start();
        setTimeout(() => { osc.stop(); ctx.close(); }, 150);
    } catch (e) { console.error("Gagal bunyi beep:", e); }
}

function startScanner(t) {
    const id = t === 'loan' ? 'reader-loan' : 'reader-return';
    if (!document.getElementById(id)) return;
    if (html5QrcodeScanner) { try { html5QrcodeScanner.clear(); } catch (e) { } }
    html5QrcodeScanner = new Html5QrcodeScanner(id, {
        fps: 10, qrbox: 250, aspectRatio: 1.0,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE, Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.EAN_13]
    });
    html5QrcodeScanner.render((txt) => { handleScan(txt, t); }, (err) => { });
}

function stopScanner() {
    if (html5QrcodeScanner) { try { html5QrcodeScanner.clear(); } catch (e) { } html5QrcodeScanner = null; }
}

function handleScan(decodedText, type) {
    if (scanLock) return;
    scanLock = true;
    playBeep();

    if (type === 'loan') {
        const inpMember = document.getElementById('loan-member-input');
        const inpBook = document.getElementById('loan-book-input');
        if (inpMember.value === '') {
            inpMember.value = decodedText;
            handleManualMember('loan');
            setTimeout(() => { scanLock = false; }, 2000);
        } else {
            inpBook.value = decodedText;
            handleManualBook('loan');
            setTimeout(() => { scanLock = false; }, 3000);
        }
    } else {
        const inpMember = document.getElementById('return-member-input');
        const inpBook = document.getElementById('return-book-input');
        if (inpMember.value === '') {
            inpMember.value = decodedText;
            handleManualMember('return');
            setTimeout(() => { scanLock = false; }, 2000);
        } else {
            inpBook.value = decodedText;
            handleManualBook('return');
            setTimeout(() => { scanLock = false; }, 3000);
        }
    }
}

function handleManualMember(t) {
    const i = document.getElementById(t + '-member-input').value;
    if (!i) return;
    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(r => {
            if (r.status) {
                document.getElementById(t + '-member-name').innerText = r.nama;
                document.getElementById(t + '-book-input').disabled = false;
                document.getElementById('btn-' + t + '-book').disabled = false;
                document.getElementById(t + '-book-input').focus();
            } else { Swal.fire('Err', r.message, 'error'); }
        }).checkMember(i);
}

function handleManualBook(t) {
    const m = document.getElementById(t + '-member-input').value;
    const b = document.getElementById(t + '-book-input').value;
    if (!b) return;
    document.getElementById(t + '-loading').classList.remove('d-none');
    const func = t === 'loan' ? 'prosesPeminjaman' : 'prosesPengembalian';
    google.script.run
        .withFailureHandler(err => {
            document.getElementById(t + '-loading').classList.add('d-none');
            handleNetworkError(err);
        })
        .withSuccessHandler(r => {
            document.getElementById(t + '-loading').classList.add('d-none');
            if (r.status) {
                document.getElementById(t + '-member-input').value = '';
                document.getElementById(t + '-member-name').innerText = '';
                document.getElementById(t + '-book-input').value = '';
                document.getElementById(t + '-book-input').disabled = true;
                if (t === 'loan') {
                    Swal.fire({ title: 'Peminjaman Sukses!', html: `<div style="text-align:left;"><p><strong>Peminjam:</strong> ${r.peminjam}</p><p><strong>Buku:</strong> ${r.judul}</p><hr><p class="text-danger"><strong>Jatuh Tempo:</strong> ${r.tglKembali}</p></div>`, icon: 'success' });
                } else {
                    Swal.fire({ title: 'Pengembalian Sukses!', html: `<div style="text-align:left;"><p><strong>Peminjam:</strong> ${r.peminjam}</p><p><strong>Buku:</strong> ${r.judul}</p><hr><p><strong>Denda:</strong> <span class="badge bg-danger">${r.denda}</span></p><p><strong>Keterlambatan:</strong> ${r.terlambat}</p></div>`, icon: 'success' });
                }
            } else { Swal.fire('Periksa Kembali', r.message, 'error'); }
        })[func](m, b, currentUser);
}

document.getElementById('btn-reset-loan').onclick = () => { document.getElementById('loan-member-input').value = ''; document.getElementById('loan-book-input').value = ''; };
document.getElementById('btn-reset-return').onclick = () => { document.getElementById('return-member-input').value = ''; document.getElementById('return-book-input').value = ''; };

function loadBooks(q = '') {
    document.getElementById('book-list-body').innerHTML = '<tr><td colspan="6" class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2 text-muted small">Memuat Data Buku...</div></td></tr>';
    google.script.run
        .withFailureHandler(err => {
            document.getElementById('book-list-body').innerHTML = '<tr><td colspan="6" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle"></i> Gagal memuat data</td></tr>';
            handleNetworkError(err);
        })
        .withSuccessHandler(res => {
            bookData = res.data;
            bookTotal = res.total;
            renderBooks();
        }).getBookList(bookPage, rowsPerPage, q);
}

function renderBooks() {
    const tb = document.getElementById('book-list-body'); tb.innerHTML = '';
    if (bookData.length === 0) { tb.innerHTML = '<tr><td colspan="6" class="text-center">Tidak ada data.</td></tr>'; document.getElementById('book-page-info').innerText = '0-0 dari 0'; return; }

    bookData.forEach(r => {
        const sisa = (r[7] !== undefined && r[7] !== "") ? r[7] : r[6];
        const judulAman = r[1].replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const tr = document.createElement('tr');

        // Kita tambahkan div.text-clamp-2 untuk judul buku, dan .nowrap-cell untuk aksi
        tr.innerHTML = '<td class="font-monospace text-primary fw-bold">' + r[0] + '</td>' +
            '<td><div class="text-clamp-2" title="' + r[1] + '">' + r[1] + '</div></td>' +
            '<td class="nowrap-cell">' + r[3] + '</td>' +
            '<td class="text-center text-muted">' + r[6] + '</td>' +
            '<td class="text-center fw-bold text-success">' + sisa + '</td>' +
            '<td class="text-end nowrap-cell">' +
            '<button class="btn btn-sm btn-outline-success me-1" onclick="processDownloadLabel(\'' + r[0] + '\',\'' + judulAman + '\')"><i class="fas fa-file-image"></i></button>' +
            '<button class="btn btn-sm text-info me-1" onclick="printLabel(\'' + r[0] + '\',\'' + judulAman + '\')"><i class="fas fa-print"></i></button>' +
            '<button class="btn btn-sm text-warning me-1" onclick="editBook(\'' + r[0] + '\')"><i class="fas fa-edit"></i></button>' +
            '<button class="btn btn-sm text-danger" onclick="delBook(\'' + r[0] + '\')"><i class="fas fa-trash"></i></button>' +
            '</td>';
        tb.appendChild(tr);
    });

    const start = (bookPage - 1) * rowsPerPage + 1;
    const end = Math.min(start + bookData.length - 1, bookTotal);
    document.getElementById('book-page-info').innerText = `${start}-${end} dari ${bookTotal}`;
}

function prevBookPage() { if (bookPage > 1) { bookPage--; loadBooks(); } }
function nextBookPage() { if (bookPage * rowsPerPage < bookTotal) { bookPage++; loadBooks(); } }
function openBookModal() { document.getElementById('formBuku').reset(); document.getElementById('bKode').readOnly = false; document.getElementById('bIsEdit').value = 'false'; document.getElementById('bOldKode').value = ''; new bootstrap.Modal(document.getElementById('modalBuku')).show(); }

function editBook(k) { const b = bookData.find(x => x[0] == k); if (b) { document.getElementById('bKode').value = b[0]; document.getElementById('bKode').readOnly = true; document.getElementById('bOldKode').value = b[0]; document.getElementById('bJudul').value = b[1]; document.getElementById('bPengarang').value = b[2]; document.getElementById('bPenerbit').value = b[3]; document.getElementById('bTahun').value = b[4]; document.getElementById('bKategori').value = b[5]; document.getElementById('bStok').value = b[6]; document.getElementById('bIsEdit').value = 'true'; new bootstrap.Modal(document.getElementById('modalBuku')).show(); } }

function submitBuku() {
    const d = {
        kode: document.getElementById('bKode').value.trim(),
        oldKode: document.getElementById('bOldKode').value,
        judul: document.getElementById('bJudul').value.trim(),
        pengarang: document.getElementById('bPengarang').value,
        penerbit: document.getElementById('bPenerbit').value,
        tahun: document.getElementById('bTahun').value,
        kategori: document.getElementById('bKategori').value,
        stok: document.getElementById('bStok').value,
        isEdit: document.getElementById('bIsEdit').value === 'true'
    };
    if (!d.kode || !d.judul) { return Swal.fire('Data Belum Lengkap', 'Kode dan Judul Buku wajib diisi!', 'warning'); }

    // Terapkan Smart Loading
    showSmartLoading('Menyimpan Buku...', 'Mengirim data ke sistem pusat.');

    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(r => {
            if (r.status) { bootstrap.Modal.getInstance(document.getElementById('modalBuku')).hide(); loadBooks(); Swal.fire('Berhasil', 'Data Buku tersimpan!', 'success'); }
            else { Swal.fire('Gagal', r.message, 'error'); }
        }).saveBook(d);
}
function delBook(k) { Swal.fire({ title: 'Hapus?', showCancelButton: true }).then(r => { if (r.isConfirmed) google.script.run.withSuccessHandler(res => { loadBooks(); }).deleteBook(k); }); }

function loadMembers(q = '') {
    document.getElementById('member-list-body').innerHTML = '<tr><td colspan="6" class="text-center py-5"><div class="spinner-border text-success" role="status"></div><div class="mt-2 text-muted small">Memuat Data Anggota...</div></td></tr>';
    google.script.run
        .withFailureHandler(err => {
            document.getElementById('member-list-body').innerHTML = '<tr><td colspan="6" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle"></i> Gagal memuat data</td></tr>';
            handleNetworkError(err);
        })
        .withSuccessHandler(res => {
            memberData = res.data;
            memberTotal = res.total;
            renderMembers();
        }).getMemberList(memberPage, rowsPerPage, q);
}

function renderMembers() {
    const tb = document.getElementById('member-list-body'); tb.innerHTML = '';
    if (memberData.length === 0) { tb.innerHTML = '<tr><td colspan="6" class="text-center">Tidak ada data.</td></tr>'; document.getElementById('member-page-info').innerText = '0-0 dari 0'; return; }

    memberData.forEach(r => {
        const tgl = safeDisplayDate(r[4]);
        const hp = r[5] ? r[5] : '-';
        const tr = document.createElement('tr');

        // Kita tambahkan div.text-clamp-2 untuk Nama, dan .nowrap-cell untuk tgl & aksi
        tr.innerHTML = '<td class="nowrap-cell">' + r[0] + '</td>' +
            '<td><div class="text-clamp-2" title="' + r[1] + '">' + r[1] + '</div></td>' +
            '<td class="nowrap-cell">' + r[2] + '</td>' +
            '<td class="nowrap-cell">' + hp + '</td>' +
            '<td class="nowrap-cell">' + tgl + '</td>' +
            '<td class="text-end nowrap-cell">' +
            '<button class="btn btn-sm btn-outline-success me-1" onclick="processDownloadCard(\'' + r[0] + '\')"><i class="fas fa-file-image"></i></button>' +
            '<button class="btn btn-sm text-info me-1" onclick="printCard(\'' + r[0] + '\')"><i class="fas fa-id-card"></i></button>' +
            '<button class="btn btn-sm text-warning me-1" onclick="editMember(\'' + r[0] + '\')"><i class="fas fa-edit"></i></button>' +
            '<button class="btn btn-sm text-danger" onclick="delMember(\'' + r[0] + '\')"><i class="fas fa-trash"></i></button>' +
            '</td>';
        tb.appendChild(tr);
    });

    const start = (memberPage - 1) * rowsPerPage + 1;
    const end = Math.min(start + memberData.length - 1, memberTotal);
    document.getElementById('member-page-info').innerText = `${start}-${end} dari ${memberTotal}`;
}

function prevMemberPage() { if (memberPage > 1) { memberPage--; loadMembers(); } }
function nextMemberPage() { if (memberPage * rowsPerPage < memberTotal) { memberPage++; loadMembers(); } }
function openMemberModal() { document.getElementById('formAnggota').reset(); document.getElementById('mId').readOnly = false; document.getElementById('mIsEdit').value = 'false'; document.getElementById('mOldId').value = ''; new bootstrap.Modal(document.getElementById('modalAnggota')).show(); }

function editMember(id) {
    const m = memberData.find(x => x[0] == id);
    if (m) {
        document.getElementById('mId').value = m[0];
        document.getElementById('mId').readOnly = true;
        document.getElementById('mOldId').value = m[0];
        document.getElementById('mNama').value = m[1];
        document.getElementById('mKelas').value = m[2];
        document.getElementById('mJk').value = m[3];
        document.getElementById('mTgl').value = safeIsoDate(m[4]);
        document.getElementById('mHp').value = m[5] || '';
        document.getElementById('mIsEdit').value = 'true';
        new bootstrap.Modal(document.getElementById('modalAnggota')).show();
    }
}

function submitAnggota() {
    const d = {
        id: document.getElementById('mId').value.trim(),
        oldId: document.getElementById('mOldId').value,
        nama: document.getElementById('mNama').value.trim(),
        kelas: document.getElementById('mKelas').value,
        jk: document.getElementById('mJk').value,
        tglLahir: document.getElementById('mTgl').value,
        nohp: document.getElementById('mHp').value,
        isEdit: document.getElementById('mIsEdit').value === 'true'
    };

    if (!d.id || !d.nama) { return Swal.fire('Data Belum Lengkap', 'ID/NISN dan Nama Anggota wajib diisi!', 'warning'); }

    // Terapkan Smart Loading
    showSmartLoading('Menyimpan Anggota...', 'Memperbarui direktori anggota.');

    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(r => {
            if (r.status) { bootstrap.Modal.getInstance(document.getElementById('modalAnggota')).hide(); loadMembers(); Swal.fire('Berhasil', 'Data Anggota tersimpan!', 'success'); }
            else { Swal.fire('Gagal', r.message, 'error'); }
        }).saveMember(d);
}
function delMember(id) { Swal.fire({ title: 'Hapus?', showCancelButton: true }).then(r => { if (r.isConfirmed) google.script.run.withSuccessHandler(res => { loadMembers(); }).deleteMember(id); }); }

function loadDashboard() {
    document.getElementById('stats-container').innerHTML = '<div class="col-12 text-center"><div class="spinner-border text-primary"></div></div>';
    google.script.run
        .withFailureHandler(err => {
            document.getElementById('stats-container').innerHTML = '<div class="col-12 text-center text-danger">Gagal memuat statistik. Coba refresh.</div>';
        })
        .withSuccessHandler(stats => {
            document.getElementById('stats-container').innerHTML = '<div class="col-6 col-md-3"><div class="glass-card p-3 d-flex align-items-center justify-content-between border-start border-4 border-primary"><div><h6 class="text-muted small mb-1">Total Judul</h6><h3 class="fw-bold text-primary mb-0">' + stats.totalJudul + '</h3></div><i class="fas fa-book fa-2x text-black-50 opacity-25"></i></div></div><div class="col-6 col-md-3"><div class="glass-card p-3 d-flex align-items-center justify-content-between border-start border-4 border-info"><div><h6 class="text-muted small mb-1">Total Stok</h6><h3 class="fw-bold text-info mb-0">' + stats.totalEksemplar + '</h3></div><i class="fas fa-layer-group fa-2x text-black-50 opacity-25"></i></div></div><div class="col-6 col-md-3"><div class="glass-card p-3 d-flex align-items-center justify-content-between border-start border-4 border-success"><div><h6 class="text-muted small mb-1">Anggota</h6><h3 class="fw-bold text-success mb-0">' + stats.totalAnggota + '</h3></div><i class="fas fa-users fa-2x text-black-50 opacity-25"></i></div></div><div class="col-6 col-md-3"><div class="glass-card p-3 d-flex align-items-center justify-content-between border-start border-4 border-secondary"><div><h6 class="text-muted small mb-1">Transaksi</h6><h3 class="fw-bold text-secondary mb-0">' + stats.totalTransaksi + '</h3></div><i class="fas fa-history fa-2x text-black-50 opacity-25"></i></div></div><div class="col-md-6"><div class="glass-card p-4 h-100"><h6 class="fw-bold text-uppercase text-muted mb-3">Status Saat Ini</h6><div class="row g-3"><div class="col-6"><div class="p-3 rounded-3 bg-warning bg-opacity-10 border border-warning text-center"><h2 class="fw-bold text-warning">' + stats.sedangDipinjam + '</h2><small class="text-muted fw-bold">Sedang Dipinjam</small></div></div><div class="col-6"><div class="p-3 rounded-3 bg-danger bg-opacity-10 border border-danger text-center"><h2 class="fw-bold text-danger">' + stats.terlambat + '</h2><small class="text-muted fw-bold">Terlambat / Denda</small></div></div></div></div></div><div class="col-md-6"><div class="glass-card p-4 h-100"><h6 class="fw-bold text-uppercase text-muted mb-3">Hall of Fame</h6><div class="d-flex align-items-center mb-3"><div class="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center me-3" style="width:40px; height:40px;"><i class="fas fa-trophy"></i></div><div><small class="d-block text-muted">Siswa Terrajin</small><span class="fw-bold text-dark">' + stats.siswaTerrajin + '</span></div></div><div class="d-flex align-items-center"><div class="bg-success text-white rounded-circle d-flex align-items-center justify-content-center me-3" style="width:40px; height:40px;"><i class="fas fa-star"></i></div><div><small class="d-block text-muted">Buku Terpopuler</small><span class="fw-bold text-dark">' + stats.bukuTerpopuler + '</span></div></div></div></div>';
        }).getDashboardStats();
}

function loadHistory(q = '') {
    const isArchive = document.getElementById('chkArsip') ? document.getElementById('chkArsip').checked : false;
    const headerTitle = document.querySelector('#page-riwayat h5');
    const badge = isArchive ? '<span class="badge bg-warning text-dark ms-2">ARSIP</span>' : '';
    headerTitle.innerHTML = `<i class="fas fa-history me-2"></i>Riwayat ${badge}`;

    injectRefreshBtn('page-riwayat', () => { historyPage = 1; loadHistory(); });
    document.getElementById('riwayat-list-body').innerHTML = '<tr><td colspan="5" class="text-center py-5"><div class="spinner-border text-secondary"></div></td></tr>';

    google.script.run
        .withFailureHandler(err => {
            document.getElementById('riwayat-list-body').innerHTML = '<tr><td colspan="5" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle"></i> Gagal memuat data riwayat</td></tr>';
            handleNetworkError(err);
        })
        .withSuccessHandler(res => {
            historyData = res.data;
            historyTotal = res.total;
            renderHistory();
        }).getHistoryList(historyPage, rowsPerPage, q, isArchive);
}

function renderHistory() {
    const tb = document.getElementById('riwayat-list-body');
    tb.innerHTML = '';
    if (!historyData || historyData.length === 0) {
        tb.innerHTML = '<tr><td colspan="5" class="text-center text-muted fst-italic py-3">Tidak ada data transaksi.</td></tr>';
        document.getElementById('riwayat-page-info').innerText = '0-0 dari 0';
        return;
    }
    const nowMs = new Date().getTime();

    historyData.forEach(r => {
        let statusColor = 'bg-secondary';
        const statusStr = r.status;
        if (statusStr.includes('Denda') || statusStr.includes('Terlambat')) statusColor = 'bg-danger';
        else if (statusStr.includes('Kembali')) statusColor = 'bg-success';
        else if (statusStr.includes('Pinjam')) statusColor = 'bg-warning text-dark';

        let btnWA = '';
        let isLate = false;

        if (!statusStr.includes('Kembali') && r.tglTempoTs > 0) {
            if (nowMs > r.tglTempoTs) {
                isLate = true;
                if (statusStr === 'Pinjam') statusColor = 'bg-danger';
            }
        }

        if (isLate && r.hpAnggota && r.hpAnggota.length > 5) {
            let hp = r.hpAnggota;
            if (hp.startsWith('0')) hp = '62' + hp.substring(1);
            let msg = `Halo *${r.namaAnggota}*,\n\nKami dari Perpustakaan mengingatkan bahwa buku:\n📚 Judul: *${r.judulBuku}*\n📅 Jatuh Tempo: *${r.tglTempo}*\n\nStatus saat ini: *TERLAMBAT*. Mohon segera dikembalikan.\nTerima kasih.`;
            btnWA = `<a href="https://wa.me/${hp}?text=${encodeURIComponent(msg)}" target="_blank" class="btn btn-sm btn-success ms-2 rounded-circle shadow-sm" style="width:32px;height:32px;padding:0;line-height:30px;" title="Kirim WA"><i class="fab fa-whatsapp"></i></a>`;
        }

        let btnDel = '';
        if (statusStr.includes('Kembali')) {
            btnDel = `<button class="btn btn-sm btn-outline-danger ms-2 rounded-circle shadow-sm" style="width:32px;height:32px;padding:0;line-height:30px;" title="Hapus Riwayat" onclick="hapusRiwayat('${r.idTrx || ''}')"><i class="fas fa-trash"></i></button>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = '<td><div class="fw-bold text-primary">' + r.namaAnggota + '</div><div class="small text-muted" style="font-size:11px;">' + r.idAnggota + '</div></td><td><div class="fw-bold text-dark text-truncate" style="max-width:180px;">' + r.judulBuku + '</div><div class="small text-muted" style="font-size:11px;">' + r.kodeBuku + '</div></td><td><div style="line-height:1.2;"><small class="d-block text-muted">Pinjam: ' + r.tglPinjam + '</small><small class="d-block ' + (isLate && !statusStr.includes('Kembali') ? 'text-danger fw-bold' : 'text-muted') + '">Tempo: ' + r.tglTempo + '</small></div></td><td><div class="d-flex align-items-center"><span class="badge ' + statusColor + '">' + (isLate && !statusStr.includes('Kembali') ? 'Terlambat' : r.status) + '</span>' + btnWA + btnDel + '</div></td>';
        tb.appendChild(tr);
    });
    const start = (historyPage - 1) * rowsPerPage + 1;
    const end = Math.min(start + historyData.length - 1, historyTotal);
    document.getElementById('riwayat-page-info').innerText = `${start}-${end} dari ${historyTotal}`;
}

function hapusRiwayat(idTrx) {
    if (!idTrx) {
        Swal.fire('Error', 'ID Riwayat tidak valid!', 'error');
        return;
    }
    const isArchive = document.getElementById('chkArsip') ? document.getElementById('chkArsip').checked : false;
    Swal.fire({
        title: 'Yakin ingin hapus?',
        text: "Data riwayat ini akan dihapus permanen!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'Menghapus...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            google.script.run
                .withFailureHandler(handleNetworkError)
                .withSuccessHandler(r => {
                    if (r.status || r.success) {
                        Swal.fire('Terhapus!', 'Riwayat berhasil dihapus.', 'success');
                        loadHistory(document.getElementById('searchRiwayat').value);
                    } else {
                        Swal.fire('Gagal', r.message, 'error');
                    }
                }).deleteHistory(idTrx, isArchive);
        }
    });
}

function formatDate(d) {
    if (!d) return "-";
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return d;
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${day}/${month}/${year}`;
}

function prevRiwayatPage() { if (historyPage > 1) { historyPage--; loadHistory(); } }
function nextRiwayatPage() { if (historyPage * rowsPerPage < historyTotal) { historyPage++; loadHistory(); } }

function loadSettingsForm() {
    // Ambil semua kolom input form
    const inputs = document.querySelectorAll('#formConfig input, #formConfig textarea, #formUser input');

    // KUNCI FORM SEMENTARA SAAT LOADING
    inputs.forEach(i => { i.disabled = true; i.style.opacity = '0.5'; });

    google.script.run
        .withFailureHandler(err => {
            console.log(err);
            inputs.forEach(i => { i.disabled = false; i.style.opacity = '1'; });
        })
        .withSuccessHandler(cfg => {
            // PAKAI TRY-CATCH: LINDUNGI DARI ERROR AGAR KUNCI PASTI TERBUKA
            try {
                if (document.getElementById('cfgNama')) document.getElementById('cfgNama').value = cfg.NamaSekolah || '';
                if (document.getElementById('cfgInstansi')) document.getElementById('cfgInstansi').value = cfg.NamaInstansi || '';
                if (document.getElementById('cfgAlamat')) document.getElementById('cfgAlamat').value = cfg.AlamatSekolah || '';
                if (document.getElementById('cfgLogo')) document.getElementById('cfgLogo').value = cfg.UrlLogo || '';
                if (document.getElementById('cfgLogoInstansi')) document.getElementById('cfgLogoInstansi').value = cfg.UrlLogoInstansi || '';
                if (document.getElementById('cfgBg')) document.getElementById('cfgBg').value = cfg.UrlBackground || '';
                if (document.getElementById('cfgRun')) document.getElementById('cfgRun').value = cfg.RunningText || '';
                if (document.getElementById('cfgUrlWin')) document.getElementById('cfgUrlWin').value = cfg.UrlWindows || '';
                if (document.getElementById('cfgUrlAnd')) document.getElementById('cfgUrlAnd').value = cfg.UrlAndroid || '';
                if (document.getElementById('cfgDenda')) document.getElementById('cfgDenda').value = cfg.DendaPerHari || 500;
                if (document.getElementById('cfgDurasi')) document.getElementById('cfgDurasi').value = cfg.DurasiPinjam || 7;
                if (document.getElementById('cfgHp')) document.getElementById('cfgHp').value = cfg.NoHP || '';
                if (document.getElementById('cfgWeb')) document.getElementById('cfgWeb').value = cfg.WebSekolah || '';
                if (document.getElementById('cfgEmail')) document.getElementById('cfgEmail').value = cfg.EmailSekolah || '';
                if (document.getElementById('cfgFolder')) document.getElementById('cfgFolder').value = cfg.IDFolderGambar || '';
                if (document.getElementById('accUser')) document.getElementById('accUser').value = currentUsername;
            } catch (e) {
                console.log("Abaikan jika ada elemen yang tidak ditemukan: " + e);
            }

            // BUKA KEMBALI KUNCI FORM (DIJAMIN JALAN)
            inputs.forEach(i => { i.disabled = false; i.style.opacity = '1'; });
        }).getAppConfig();
}

function saveSettings() {
    // 1. Amankan variabel gambar (kalau variabelnya lupa dipasang, anggap saja null biar gak crash)
    const logoInstansiVal = typeof uploadLogoInstansiBase64 !== 'undefined' ? uploadLogoInstansiBase64 : null;
    const logoVal = typeof uploadLogoBase64 !== 'undefined' ? uploadLogoBase64 : null;
    const bgVal = typeof uploadBgBase64 !== 'undefined' ? uploadBgBase64 : null;

    // 2. Tarik data dari form dengan aman (pakai tanda '?' supaya kalau ada kolom yang terhapus, webnya gak error)
    const data = {
        namaSekolah: document.getElementById('cfgNama')?.value || '',
        namaInstansi: document.getElementById('cfgInstansi')?.value || '',
        alamatSekolah: document.getElementById('cfgAlamat')?.value || '',
        urlLogo: document.getElementById('cfgLogo')?.value || '',
        urlLogoInstansi: document.getElementById('cfgLogoInstansi')?.value || '',
        urlBg: document.getElementById('cfgBg')?.value || '',
        uploadLogo: logoVal,
        uploadLogoInstansi: logoInstansiVal,
        uploadBg: bgVal,
        runningText: document.getElementById('cfgRun')?.value || '',
        urlWin: document.getElementById('cfgUrlWin')?.value || '',
        urlAnd: document.getElementById('cfgUrlAnd')?.value || '',
        denda: document.getElementById('cfgDenda')?.value || 0,
        durasi: document.getElementById('cfgDurasi')?.value || 0,
        nohp: document.getElementById('cfgHp')?.value || '',
        website: document.getElementById('cfgWeb')?.value || '',
        email: document.getElementById('cfgEmail')?.value || '',
        idFolder: document.getElementById('cfgFolder')?.value || ''
    };

    let desc = 'Sedang memperbarui aturan dan identitas...';
    if (bgVal || logoVal || logoInstansiVal) desc = 'Sedang mengunggah file foto ke Google Drive...';

    showSmartLoading('Menyimpan Pengaturan...', desc);

    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(res => {
            if (res.status) {
                Swal.fire({ title: 'Berhasil', text: 'Pengaturan tersimpan.', icon: 'success' }).then(() => {
                    // Kosongkan memori gambar setelah sukses simpan
                    if (typeof uploadBgBase64 !== 'undefined') uploadBgBase64 = null;
                    if (typeof uploadLogoBase64 !== 'undefined') uploadLogoBase64 = null;
                    if (typeof uploadLogoInstansiBase64 !== 'undefined') uploadLogoInstansiBase64 = null;
                    loadAppConfig();
                });
            } else {
                Swal.fire('Gagal', res.message, 'error');
            }
        }).saveAppConfig(data);
}

function updateAccount() {
    const newUser = document.getElementById('accUser').value; const newPass = document.getElementById('accPass').value;
    if (!newUser || !newPass) { Swal.fire('Error', 'Wajib diisi', 'warning'); return; }
    Swal.fire({ title: 'Konfirmasi', text: 'Anda akan logout.', icon: 'warning', showCancelButton: true }).then(r => {
        if (r.isConfirmed) {
            showSmartLoading('Mengupdate Akun...', 'Menyinkronkan data kredensial baru.');
            google.script.run
                .withFailureHandler(handleNetworkError)
                .withSuccessHandler(res => { if (res.status) { localStorage.clear(); location.reload(); } else Swal.fire('Gagal', res.message, 'error'); }).updateUserCredentials(currentUsername, newUser, newPass);
        }
    });
}

function downloadTemplate(t) {
    const n = t === 'buku' ? "Template_Buku.xlsx" : "Template_Anggota.xlsx";
    const h = t === 'buku' ? ["Kode", "Judul", "Pengarang", "Penerbit", "Tahun", "Kategori", "Stok Total"] : ["ID/NISN", "Nama", "Kelas", "JK", "Tgl. Lahir (yyyy-mm-dd)", "No. HP/WA"];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([h]), "Template"); XLSX.writeFile(wb, n);
}

function triggerImport(t) { importType = t; document.getElementById('fileInput').click(); }

function processImport(i) {
    const f = i.files[0]; const r = new FileReader();
    r.onload = (e) => {
        const d = new Uint8Array(e.target.result); const wb = XLSX.read(d, { type: 'array' });

        // Terapkan Smart Loading
        showSmartLoading('Mengimpor Excel...', 'Mengecek duplikasi dan memasukkan data.');

        google.script.run
            .withFailureHandler(handleNetworkError)
            .withSuccessHandler(res => {
                if (res.status) {
                    if (importType === 'buku') loadBooks(); else loadMembers();
                    Swal.fire({ title: 'Selesai!', text: res.message, icon: res.message.includes('Ditolak') ? 'warning' : 'success' });
                } else {
                    Swal.fire('Gagal', res.message, 'error');
                }
                i.value = '';
            }).processExcelData(importType, XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }));
    }; r.readAsArrayBuffer(f);
}

function printLabel(kode, judul) {
    const htmlPreview = '<div style="display:flex;justify-content:center;padding:10px;"><div class="book-label-preview" style="width:250px;height:150px;background:#fff;border:2px solid #333;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;"><div style="font-weight:bold;font-size:14px;margin-bottom:5px;line-height:1.2;max-height:40px;overflow:hidden;">' + judul + '</div><div style="font-size:12px;margin-top:5px;background:#000;color:#fff;padding:2px 8px;border-radius:4px;">' + kode + '</div><div id="qrcode-book" style="margin-top:10px;"></div></div></div>';

    Swal.fire({
        title: 'Preview',
        html: htmlPreview,
        showConfirmButton: true,
        confirmButtonText: 'Cetak',
        didOpen: () => { new QRCode(document.getElementById("qrcode-book"), { text: kode, width: 70, height: 70 }); }
    }).then((r) => {
        if (r.isConfirmed) {
            // --- FIX BUG QR CODE CETAK ---
            const qrBox = document.getElementById("qrcode-book");
            const canvas = qrBox.querySelector('canvas');
            const img = qrBox.querySelector('img');
            if (canvas && img) {
                img.src = canvas.toDataURL("image/png");
                img.style.display = "block";
                canvas.style.display = "none";
            }
            // -----------------------------

            var win = window.open('', '', 'height=500,width=500');
            win.document.write('<html><head><title>Cetak Label</title></head><body style="padding:20px;">' + document.querySelector('.book-label-preview').outerHTML + '</body></html>');
            win.document.close();
            setTimeout(() => { win.print(); }, 400);
        }
    });
}

function printCard(id) {
    const m = memberData.find(x => x[0] == id); if (!m) return;
    const nama = m[1]; const jk = m[3] == 'L' ? 'Laki-laki' : 'Perempuan'; const tgl = m[4] ? new Date(m[4]).toLocaleDateString('id-ID') : '-';
    const sekolah = document.getElementById('sidebar-school-name').innerText || 'Perpus';
    const logo = globalLogoUrl || 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png';

    const htmlPreview = '<div style="display:flex;justify-content:center;padding:10px;"><div class="id-card-preview" style="width:320px;height:200px;background:#f8f9fa;border:1px solid #ddd;border-radius:15px;overflow:hidden;text-align:left;position:relative;"><div style="background:#4361ee;height:50px;display:flex;align-items:center;padding:0 15px;color:white;"><img src="' + logo + '" crossorigin="anonymous" style="height:35px;width:35px;background:#fff;border-radius:50%;padding:2px;margin-right:10px;"><div style="font-weight:bold;font-size:13px;">' + sekolah + '</div></div><div style="padding:15px;display:flex;justify-content:space-between;"><div style="flex:1;"><h3 style="margin:0 0 5px;font-size:16px;">' + nama + '</h3><p style="font-size:11px;color:#666;margin:0;">ID: <b>' + id + '</b></p><p style="font-size:11px;color:#666;margin:0;">' + jk + '</p><p style="font-size:11px;color:#666;margin:0;">Lahir: ' + tgl + '</p></div><div id="qrcode-mem"></div></div><div style="position:absolute;bottom:10px;width:100%;text-align:center;font-size:10px;font-weight:bold;color:#4361ee;">KARTU PERPUSTAKAAN DIGITAL</div></div></div>';

    Swal.fire({
        width: 450,
        title: 'Preview',
        html: htmlPreview,
        didOpen: () => { new QRCode(document.getElementById("qrcode-mem"), { text: id, width: 65, height: 65 }); }
    }).then(r => {
        if (r.isConfirmed) {
            // --- FIX BUG QR CODE CETAK ---
            const qrBox = document.getElementById("qrcode-mem");
            const canvas = qrBox.querySelector('canvas');
            const img = qrBox.querySelector('img');
            if (canvas && img) {
                img.src = canvas.toDataURL("image/png");
                img.style.display = "block"; // Tampilkan gambar
                canvas.style.display = "none"; // Sembunyikan canvas
            }
            // -----------------------------

            var win = window.open('', '', 'height=500,width=500');
            win.document.write('<html><head><title>Cetak Kartu</title></head><body style="padding:20px;">' + document.querySelector('.id-card-preview').outerHTML + '</body></html>');
            win.document.close();
            setTimeout(() => { win.print(); }, 400); // Beri waktu gambar merender sebelum cetak
        }
    });
}

function processDownloadLabel(kode, judul) {
    const c = document.createElement('div'); c.style.position = 'fixed'; c.style.top = '-9999px';
    c.innerHTML = '<div id="cap-lbl" style="width:300px;height:180px;background:#fff;border:4px solid #333;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:10px;"><div style="font-weight:bold;font-size:16px;margin-bottom:10px;">' + judul + '</div><div style="background:#000;color:#fff;padding:4px 10px;">' + kode + '</div><div id="qr-dl" style="margin-top:15px;"></div></div>';
    document.body.appendChild(c); new QRCode(document.getElementById("qr-dl"), { text: kode, width: 80, height: 80 });

    showSmartLoading('Menyiapkan Label...', 'Menggambar komponen desain.');

    setTimeout(() => {
        html2canvas(document.getElementById('cap-lbl'), { scale: 2 }).then(cv => {
            document.body.removeChild(c);
            const img = cv.toDataURL();
            Swal.fire({ title: 'Review', imageUrl: img, imageWidth: 300, showCancelButton: true, confirmButtonText: 'Download' }).then(res => {
                if (res.isConfirmed) {
                    const link = document.createElement('a'); link.download = 'Label_' + kode + '.png'; link.href = img; link.click();
                }
            });
        });
    }, 500);
}

function processDownloadCard(id) {
    const m = memberData.find(x => x[0] == id); if (!m) return;
    const nama = m[1]; const jk = m[3] == 'L' ? 'Laki-laki' : 'Perempuan'; const tgl = m[4] ? new Date(m[4]).toLocaleDateString('id-ID') : '-';
    const sek = document.getElementById('sidebar-school-name').innerText || 'Perpus';
    const logo = globalLogoUrl || 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png';

    const c = document.createElement('div'); c.style.position = 'fixed'; c.style.top = '-9999px';
    c.innerHTML = '<div id="cap-card" style="width:400px;height:250px;background:#f8f9fa;border:1px solid #ddd;border-radius:15px;overflow:hidden;text-align:left;position:relative;font-family:Arial;"><div style="background:#4361ee;height:60px;display:flex;align-items:center;padding:0 20px;color:white;"><img src="' + logo + '" crossorigin="anonymous" style="height:45px;width:45px;background:#fff;border-radius:50%;padding:2px;margin-right:15px;"><div style="font-weight:bold;font-size:16px;">' + sek + '</div></div><div style="padding:20px;display:flex;justify-content:space-between;"><div style="flex:1;"><h3 style="margin:0 0 5px;font-size:20px;">' + nama + '</h3><p style="font-size:13px;color:#666;margin:2px 0;">ID: <b>' + id + '</b></p><p style="font-size:13px;color:#666;margin:2px 0;">' + jk + '</p><p style="font-size:13px;color:#666;margin:2px 0;">Lahir: ' + tgl + '</p></div><div id="qr-c-dl"></div></div><div style="position:absolute;bottom:15px;width:100%;text-align:center;font-size:12px;font-weight:bold;color:#4361ee;">KARTU PERPUSTAKAAN DIGITAL</div></div>';
    document.body.appendChild(c); new QRCode(document.getElementById("qr-c-dl"), { text: id, width: 85, height: 85 });

    showSmartLoading('Menyiapkan Kartu...', 'Merender foto dan QR Code...');

    // KUNCI PERBAIKAN 3: Tambahkan allowTaint: true agar gambar dari Google Drive diizinkan
    setTimeout(() => {
        html2canvas(document.getElementById('cap-card'), { scale: 2, useCORS: true, allowTaint: true }).then(cv => {
            document.body.removeChild(c);
            const img = cv.toDataURL();
            Swal.fire({ title: 'Review', imageUrl: img, imageWidth: 400, showCancelButton: true, confirmButtonText: 'Download' }).then(res => {
                if (res.isConfirmed) {
                    const link = document.createElement('a'); link.download = 'Kartu_' + id + '.png'; link.href = img; link.click();
                }
            });
        });
    }, 800);
}

function refreshCurrentPage() {
    const btn = document.getElementById('btn-global-refresh');
    if (btn) {
        const icon = btn.querySelector('i');
        icon.classList.add('fa-spin');
        setTimeout(() => icon.classList.remove('fa-spin'), 1000);
    }
    const activePage = localStorage.getItem('siempus_page') || 'dashboard';
    if (activePage === 'dashboard') loadDashboard();
    else if (activePage === 'buku') { bookPage = 1; loadBooks(); }
    else if (activePage === 'anggota') { memberPage = 1; loadMembers(); }
    else if (activePage === 'riwayat') { historyPage = 1; loadHistory(); }
    else if (activePage === 'pengaturan') loadSettingsForm();
}

// --- LOGIKA KHUSUS MENU MOBILE ---
function updateMobileNav(pageId) {
    // Hapus class 'active' dari semua menu bawah
    document.querySelectorAll('.bottom-nav-item').forEach(el => {
        el.classList.remove('active');
    });

    // Tambahkan class 'active' ke menu yang diklik (jika ada di menu bawah)
    const activeNav = document.getElementById('mob-nav-' + pageId);
    if (activeNav) {
        activeNav.classList.add('active');
    }
}

// Fungsi Logout Khusus Tombol HP
document.getElementById('nav-logout-mobile').addEventListener('click', () => {
    document.getElementById('nav-logout').click(); // Memicu sweetalert logout yang sudah ada
});

// Update fungsi loadAppConfig agar logo & nama di HP juga ikut berubah dari Database
const originalLoadAppConfig = loadAppConfig;
loadAppConfig = function () {
    originalLoadAppConfig();
    // Tambahan untuk update Header HP
    google.script.run.withSuccessHandler(cfg => {
        if (cfg.UrlLogo) {
            const mLogo = document.getElementById('mobile-logo-img');
            if (mLogo) { mLogo.src = cfg.UrlLogo; mLogo.onerror = () => mLogo.src = 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png'; }
        }
        if (cfg.NamaSekolah) {
            const mText = document.getElementById('mobile-school-text');
            if (mText) mText.textContent = cfg.NamaSekolah;
        }
    }).getAppConfig();
};



// ==========================================================
// 1. FITUR CETAK SEMUA BARCODE BUKU (A4 3x3 + LOGO & QR BESAR)
// ==========================================================
function printAllLabels() {
    showSmartLoading('Menyiapkan Barcode...', 'Mengambil semua data buku dan menyusun layout kertas A4.');

    apiHelper()
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(allBooks => {
            if (allBooks.length === 0) { Swal.fire('Kosong', 'Belum ada data buku untuk dicetak.', 'info'); return; }

            // FILTER TAHUN
            const fTahun = document.getElementById('filterTahunExport').value.trim().toLowerCase();
            if (fTahun && fTahun !== '') {
                allBooks = allBooks.filter(b => String(b[4]).toLowerCase() === fTahun);
            }
            if (allBooks.length === 0) { Swal.fire('Kosong', 'Tidak ada buku di tahun tersebut.', 'info'); return; }

            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute'; tempDiv.style.left = '-9999px';
            document.body.appendChild(tempDiv);

            // Ambil logo sekolah
            const logo = globalLogoUrl || 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png';
            let htmlContent = `<div class="print-page">`;

            allBooks.forEach((b, index) => {
                const kode = b[0];
                const judul = b[1];

                // Halaman baru setiap 9 kotak
                if (index > 0 && index % 9 === 0) {
                    htmlContent += `</div><div class="print-page" style="page-break-before: always;">`;
                }

                htmlContent += `
                    <div class="label-box">
                        <img src="${logo}" class="label-logo" crossorigin="anonymous">
                        <div class="label-title">${judul}</div>
                        <div class="label-kode">${kode}</div>
                        <div id="qr-batch-${index}" class="qr-container"></div>
                    </div>
                `;
            });
            htmlContent += `</div>`;
            tempDiv.innerHTML = htmlContent;

            // Generate QR Code (Diperbesar jadi 120x120)
            allBooks.forEach((b, index) => {
                new QRCode(document.getElementById(`qr-batch-${index}`), { text: b[0], width: 120, height: 120 });
            });

            setTimeout(() => {
                allBooks.forEach((b, index) => {
                    const qrBox = document.getElementById(`qr-batch-${index}`);
                    if (qrBox) {
                        const canvas = qrBox.querySelector('canvas');
                        const img = qrBox.querySelector('img');
                        if (canvas && img) { img.src = canvas.toDataURL("image/png"); img.style.display = "block"; canvas.style.display = "none"; }
                    }
                });

                const printWindow = window.open('', '', 'height=800,width=1000');
                const css = `
                    <style>
                        @page { size: A4; margin: 10mm; }
                        /* Kode sakti agar warna tercetak di PDF */
                        body { 
                            font-family: 'Arial', sans-serif; margin: 0; padding: 0; background: #fff; 
                            -webkit-print-color-adjust: exact !important; 
                            print-color-adjust: exact !important; 
                        }
                        .print-page {
                            display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr);
                            gap: 10px; width: 190mm; height: 277mm; box-sizing: border-box;
                        }
                        .label-box {
                            border: 2px solid #333; border-radius: 8px; display: flex; flex-direction: column;
                            align-items: center; justify-content: center; text-align: center; padding: 10px; box-sizing: border-box;
                        }
                        .label-logo { width: 35px; height: 35px; object-fit: contain; margin-bottom: 5px; }
                        .label-title { font-weight: bold; font-size: 13px; margin-bottom: 5px; max-height: 38px; overflow: hidden; line-height: 1.2; }
                        .label-kode { background: #000; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 14px; font-weight: bold; margin-bottom: 10px; letter-spacing: 1px; }
                        .qr-container img { margin: 0 auto; display: block; }
                    </style>
                `;

                printWindow.document.write('<html><head><title>Cetak Label Buku</title>' + css + '</head><body>' + tempDiv.innerHTML + '</body></html>');
                printWindow.document.close();
                document.body.removeChild(tempDiv);
                Swal.close();
                setTimeout(() => { printWindow.print(); }, 500);
            }, 1000);

        }).getAllDataForExport('buku');
}

// ==========================================================
// 2. FITUR CETAK SEMUA KARTU ANGGOTA (A4 2x5 = 10 Kartu)
// STANDAR ID CARD: 8.1 cm x 5 cm
// ==========================================================
function printAllCards() {
    showSmartLoading('Menyiapkan Kartu...', 'Mengambil data anggota dan menyusun layout kertas A4.');

    apiHelper()
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(allMembers => {
            if (allMembers.length === 0) { Swal.fire('Kosong', 'Belum ada data anggota.', 'info'); return; }
            // FILTER KELAS
            const fKelas = document.getElementById('filterKelasExport').value.trim().toLowerCase();
            if (fKelas && fKelas !== '') {
                allMembers = allMembers.filter(m => String(m[2]).toLowerCase() === fKelas);
            }
            if (allMembers.length === 0) { Swal.fire('Kosong', 'Tidak ada siswa di kelas tersebut.', 'info'); return; }

            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute'; tempDiv.style.left = '-9999px';
            document.body.appendChild(tempDiv);

            const sekolah = document.getElementById('sidebar-school-name').innerText || 'Perpustakaan Sekolah';
            const logo = globalLogoUrl || 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png';

            let htmlContent = `<div class="print-page">`;

            allMembers.forEach((m, index) => {
                const id = m[0]; const nama = m[1];
                const jk = m[3] == 'L' ? 'Laki-laki' : (m[3] == 'P' ? 'Perempuan' : m[3]);
                const tgl = m[4] ? new Date(m[4]).toLocaleDateString('id-ID') : '-';

                // Halaman baru setiap 10 kartu (2 kolom x 5 baris)
                if (index > 0 && index % 10 === 0) {
                    htmlContent += `</div><div class="print-page" style="page-break-before: always;">`;
                }

                htmlContent += `
                    <div class="card-wrapper">
                        <div class="id-card">
                            <div class="card-header">
                                <img src="${logo}" crossorigin="anonymous">
                                <div>${sekolah}</div>
                            </div>
                            <div class="card-body">
                                <div class="card-info">
                                    <h3>${nama}</h3>
                                    <p>ID: <b>${id}</b></p>
                                    <p>${jk}</p>
                                    <p>Lahir: ${tgl}</p>
                                </div>
                                <div id="qr-batch-mem-${index}" class="qr-container"></div>
                            </div>
                            <div class="card-footer">KARTU PERPUSTAKAAN DIGITAL</div>
                        </div>
                    </div>
                `;
            });
            htmlContent += `</div>`;
            tempDiv.innerHTML = htmlContent;

            // Generate QR Code (Ukuran 85x85)
            allMembers.forEach((m, index) => {
                new QRCode(document.getElementById(`qr-batch-mem-${index}`), { text: m[0], width: 85, height: 85 });
            });

            setTimeout(() => {
                allMembers.forEach((m, index) => {
                    const qrBox = document.getElementById(`qr-batch-mem-${index}`);
                    if (qrBox) {
                        const canvas = qrBox.querySelector('canvas');
                        const img = qrBox.querySelector('img');
                        if (canvas && img) { img.src = canvas.toDataURL("image/png"); img.style.display = "block"; canvas.style.display = "none"; }
                    }
                });

                const printWindow = window.open('', '', 'height=800,width=1000');
                const css = `
                    <style>
                        @page { size: A4 portrait; margin: 5mm; } /* Margin dikecilkan agar muat 5 baris */
                        
                        /* Kode sakti agar warna tercetak di PDF */
                        body { 
                            font-family: 'Arial', sans-serif; margin: 0; padding: 0; background: #fff; 
                            -webkit-print-color-adjust: exact !important; 
                            print-color-adjust: exact !important; 
                        }
                        
                        /* Layout Grid dengan ukuran fix dalam centimeter */
                        .print-page {
                            display: grid; 
                            grid-template-columns: 8.1cm 8.1cm; /* 2 Kolom lebar 8.1 cm */
                            grid-template-rows: repeat(5, 5cm); /* 5 Baris tinggi 5 cm */
                            column-gap: 10mm; /* Jarak antar kolom menyamping */
                            row-gap: 3mm; /* Jarak antar baris ke bawah dibuat sangat mepet */
                            justify-content: center; /* Posisikan di tengah kertas */
                            align-content: start;
                            width: 100%; height: 287mm; box-sizing: border-box;
                            padding-top: 5mm;
                        }
                        
                        .card-wrapper { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }

                        /* Kartu mengikuti ukuran grid induknya (8.1 x 5 cm) */
                        .id-card {
                            width: 100%; height: 100%; background: #f8f9fa; border: 2px solid #ddd;
                            border-radius: 12px; overflow: hidden; position: relative; box-sizing: border-box;
                        }
                        .card-header { background: #4361ee; height: 1.2cm; display: flex; align-items: center; padding: 0 15px; color: white; }
                        .card-header img { height: 0.9cm; width: 0.9cm; background: #fff; border-radius: 50%; padding: 2px; margin-right: 10px; object-fit: contain; }
                        .card-header div { font-weight: bold; font-size: 13px; }
                        .card-body { padding: 8px 15px; display: flex; justify-content: space-between; align-items: flex-start; }
                        .card-info h3 { margin: 0 0 4px; font-size: 14px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 4.5cm; }
                        .card-info p { font-size: 11px; color: #666; margin: 1px 0; }
                        .card-footer { position: absolute; bottom: 5px; width: 100%; text-align: center; font-size: 10px; font-weight: bold; color: #4361ee; }
                        .qr-container { margin-top: -3px; }
                    </style>
                `;

                printWindow.document.write('<html><head><title>Cetak Semua Kartu Anggota</title>' + css + '</head><body>' + tempDiv.innerHTML + '</body></html>');
                printWindow.document.close();
                document.body.removeChild(tempDiv);
                Swal.close();
                setTimeout(() => { printWindow.print(); }, 800);

            }, 1200);

        }).getAllDataForExport('anggota');
}

// ==========================================================
// 🤖 FITUR GOOGLE GEMINI AI STUDIO
// ==========================================================

// Tampilkan tombol chat AI hanya jika user sudah login (Taruh ini di dalam fungsi showPage() kamu jika mau)
document.addEventListener("DOMContentLoaded", () => {
    if (localStorage.getItem('siempus_user')) {
        document.getElementById('btn-ai-chat').classList.remove('d-none');
    }
});

// --- FITUR 1: AI AUTO-LENGKAPI BUKU (VIA BACKEND) ---
function lengkapiBukuDenganAI() {
    const judul = document.getElementById('bJudul').value.trim();
    if (!judul) return Swal.fire('Oops', 'Ketik judul bukunya dulu ya!', 'warning');

    const btn = document.getElementById('btn-ai-buku');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    const prompt = `Berikan informasi buku nyata dengan judul mirip "${judul}". Balas HANYA dengan format JSON murni tanpa awalan/akhiran markdown. Format: {"pengarang":"nama", "penerbit":"nama", "tahun":"20xx", "kategori":"Kategori buku"}. Jika tidak tahu, tebak dengan masuk akal.`;

    google.script.run
        .withFailureHandler(err => {
            btn.innerHTML = '<i class="fas fa-magic"></i> AI'; btn.disabled = false;
            Swal.fire('Gagal', 'Koneksi ke backend AI terputus.', 'error');
        })
        .withSuccessHandler(res => {
            btn.innerHTML = '<i class="fas fa-magic"></i> AI'; btn.disabled = false;
            if (res.status) {
                let textResult = res.result.replace(/```json/g, '').replace(/```/g, '').trim();
                try {
                    const info = JSON.parse(textResult);
                    if (info.pengarang) document.getElementById('bPengarang').value = info.pengarang;
                    if (info.penerbit) document.getElementById('bPenerbit').value = info.penerbit;
                    if (info.tahun) document.getElementById('bTahun').value = info.tahun;
                    if (info.kategori) document.getElementById('bKategori').value = info.kategori;
                    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Buku dilengkapi AI!', showConfirmButton: false, timer: 2000 });
                } catch (e) {
                    Swal.fire('Error', 'Format data AI tidak sesuai.', 'error');
                }
            } else {
                Swal.fire('Gagal', res.message, 'error');
            }
        }).callGeminiAI(prompt);
}

// --- FITUR 3: WIDGET ASISTEN AI (VIA BACKEND) ---
function sendAIChat() {
    const inputEl = document.getElementById('ai-chat-input');
    const msg = inputEl.value.trim();
    if (!msg) return;

    const chatBody = document.getElementById('ai-chat-body');
    const btnSend = document.getElementById('btn-send-ai');

    chatBody.innerHTML += `<div class="p-2 bg-primary text-white rounded-3 shadow-sm" style="align-self: flex-end; max-width: 85%; font-size: 13px;">${msg}</div>`;
    inputEl.value = '';
    btnSend.disabled = true;
    btnSend.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    chatBody.scrollTop = chatBody.scrollHeight;

    const systemContext = buildDatabaseContext(); // Pastikan fungsi ini tetap ada di kodemu
    const finalPrompt = `Konteks Data Perpustakaan Saat Ini:\n${systemContext}\n\nPertanyaan User: "${msg}"\n\nINSTRUKSI PENTING UNTUK AI:\n1. Jika user bertanya tentang data spesifik perpustakaan sekolah ini, jawab HANYA berdasarkan "Konteks Data" di atas. Jika data kosong, minta admin buka menu terkait.\n2. JIKA user bertanya hal UMUM, gunakan wawasan luasmu.\n3. Jawab dengan gaya bahasa ramah dan gaul.`;

    google.script.run
        .withFailureHandler(err => {
            btnSend.disabled = false; btnSend.innerHTML = '<i class="fas fa-paper-plane"></i>';
            chatBody.innerHTML += `<div class="p-2 bg-danger text-white rounded-3 shadow-sm" style="align-self: flex-start; max-width: 85%; font-size: 13px;">Koneksi error!</div>`;
            chatBody.scrollTop = chatBody.scrollHeight;
        })
        .withSuccessHandler(res => {
            btnSend.disabled = false; btnSend.innerHTML = '<i class="fas fa-paper-plane"></i>';
            if (res.status) {
                let botReply = res.result.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>');
                chatBody.innerHTML += `<div class="p-2 bg-white rounded-3 border shadow-sm" style="align-self: flex-start; max-width: 85%; font-size: 13px;">${botReply}</div>`;
            } else {
                chatBody.innerHTML += `<div class="p-2 bg-warning text-dark rounded-3 shadow-sm" style="align-self: flex-start; max-width: 85%; font-size: 13px;">AI: ${res.message}</div>`;
            }
            chatBody.scrollTop = chatBody.scrollHeight;
        }).callGeminiAI(finalPrompt);
}

// --- FITUR 3: WIDGET ASISTEN AI BERBASIS DATABASE ---

function toggleAIChat() {
    const box = document.getElementById('ai-chat-box');
    if (box.classList.contains('d-none')) {
        box.classList.remove('d-none');
        document.getElementById('ai-chat-input').focus();
    } else {
        box.classList.add('d-none');
    }
}

// Fungsi untuk menyusun konteks (mengambil data dari layar/sistem) untuk disuapkan ke AI
// Fungsi untuk menyusun konteks (mengambil data dari layar/sistem) untuk disuapkan ke AI
function buildDatabaseContext() {
    let context = "Kamu adalah Asisten AI Perpustakaan SiE-MPuS. Jawab dengan ramah, singkat, dan bahasa Indonesia gaul tapi sopan. Berikut adalah ringkasan data perpustakaan saat ini:\n\n";

    // 1. Ambil data langsung dari variabel global (Paling akurat)
    context += `- Total Judul Buku (di tabel): ${bookTotal} judul\n`;
    context += `- Total Anggota (di tabel): ${memberTotal} orang\n`;
    context += `- Total Transaksi Riwayat: ${historyTotal}\n`;

    // 2. Ambil (Scraping) data dari Dashboard
    const h3s = document.querySelectorAll('#stats-container h3'); // Mengambil angka-angka utama
    const h2s = document.querySelectorAll('#stats-container h2'); // Mengambil angka status saat ini
    const spans = document.querySelectorAll('#stats-container .d-flex span.fw-bold.text-dark'); // Mengambil nama Hall of Fame

    if (h3s.length >= 4) {
        context += `- Total Judul Buku (Dashboard): ${h3s[0].innerText}\n`;
        context += `- Total Eksemplar/Stok (Dashboard): ${h3s[1].innerText}\n`;
        context += `- Total Anggota Terdaftar (Dashboard): ${h3s[2].innerText}\n`;
        context += `- Total Peminjaman Sepanjang Waktu (Dashboard): ${h3s[3].innerText}\n`;
    }

    if (h2s.length >= 2) {
        context += `- Buku yang sedang dipinjam saat ini: ${h2s[0].innerText}\n`;
        context += `- Jumlah Transaksi Terlambat/Denda saat ini: ${h2s[1].innerText}\n`;
    }

    if (spans.length >= 2) {
        context += `- Siswa Terajin (Paling sering pinjam): ${spans[0].innerText}\n`;
        context += `- Buku Terpopuler (Paling sering dipinjam): ${spans[1].innerText}\n`;
    }

    // 3. Cek memori riwayat transaksi untuk melihat siapa yang telat
    if (typeof historyData !== 'undefined' && historyData.length > 0) {
        const nowMs = new Date().getTime();
        const telat = historyData.filter(r => (!r.status.includes('Kembali') && r.tglTempoTs > 0 && nowMs > r.tglTempoTs) || r.status.includes('Denda') || r.status.includes('Terlambat'));

        if (telat.length > 0) {
            const namaTelat = telat.map(r => `${r.namaAnggota} (Buku: ${r.judulBuku})`).join(", ");
            context += `- Daftar siswa yang SEDANG TERLAMBAT: ${namaTelat}.\n`;
        } else {
            context += `- Saat ini tidak ada siswa yang terlambat di catatan tabel.\n`;
        }
    }

    // 4. Cek memori buku untuk rekomendasi
    if (typeof bookData !== 'undefined' && bookData.length > 0) {
        // Ambil 10 buku pertama sebagai contoh rekomendasi
        const rekomendasi = bookData.slice(0, 10).map(b => b[1]).join(", ");
        context += `- Beberapa contoh koleksi judul buku yang ada di perpus: ${rekomendasi}.\n`;
    }

    return context;
}

// Memicu tombol Enter di Chat AI
document.getElementById('ai-chat-input')?.addEventListener("keypress", function (event) {
    if (event.key === "Enter") { event.preventDefault(); sendAIChat(); }
});

// FITUR AUTO-LENGKAPI NISN 10 DIGIT
function formatNISN() {
    const inputEl = document.getElementById('mId');
    let val = inputEl.value.trim();

    // Jika input tidak kosong dan kurang dari 10 digit
    if (val !== "" && val.length < 10) {
        // Tampilkan peringatan
        Swal.fire({
            icon: 'info',
            title: 'Format NISN Disesuaikan',
            text: `NISN wajib 10 digit. Sistem otomatis menambahkan angka 0 di depan data Anda.`,
            timer: 3500, // Hilang otomatis dalam 3.5 detik
            showConfirmButton: false
        });

        // Tambahkan 0 di depan otomatis sampai pas 10 digit
        inputEl.value = val.padStart(10, '0');
    }
}

// --- LOGIKA MODAL IMPORT ---
let currentImportTarget = '';
function openImportModal(type) {
    currentImportTarget = type;
    document.getElementById('importTitle').innerText = type === 'buku' ? 'Buku' : 'Anggota';
    new bootstrap.Modal(document.getElementById('modalImport')).show();
}
function downloadCurrentTemplate() {
    downloadTemplate(currentImportTarget);
}
function triggerActualImport() {
    bootstrap.Modal.getInstance(document.getElementById('modalImport')).hide();
    triggerImport(currentImportTarget);
}

// --- UPDATE FUNGSI EXPORT (DENGAN FILTER) ---
function exportData(type) {
    showSmartLoading('Mempersiapkan Unduhan...', 'Menyaring data dari database.');
    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(serverData => {
            if (serverData.length === 0) { Swal.fire('Info', 'Belum ada data.', 'info'); return; }

            let targetData = serverData;
            let headers = []; let fileName = "";

            // LOGIKA FILTER
            if (type === 'buku') {
                headers = ["Kode Buku", "Judul", "Pengarang", "Penerbit", "Tahun", "Kategori", "Stok Total", "Stok Tersedia"];
                fileName = "Data_Buku.xlsx";

                const fTahun = document.getElementById('filterTahunExport').value.trim().toLowerCase();
                if (fTahun && fTahun !== '') {
                    targetData = serverData.filter(b => String(b[4]).toLowerCase() === fTahun); // Kolom 4 = Tahun
                    fileName = `Data_Buku_Tahun_${fTahun}.xlsx`;
                }
            } else {
                headers = ["ID/NISN", "Nama Lengkap", "Kelas", "Jenis Kelamin", "Tanggal Lahir", "No. HP"];
                fileName = "Data_Anggota.xlsx";

                const fKelas = document.getElementById('filterKelasExport').value.trim().toLowerCase();
                if (fKelas && fKelas !== '') {
                    targetData = serverData.filter(m => String(m[2]).toLowerCase() === fKelas); // Kolom 2 = Kelas
                    fileName = `Data_Anggota_Kelas_${fKelas}.xlsx`;
                }
            }

            if (targetData.length === 0) {
                Swal.fire('Kosong', 'Tidak ada data yang cocok dengan filter tersebut.', 'info');
                return;
            }

            const dataToExport = [headers, ...targetData];
            const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet(dataToExport);
            XLSX.utils.book_append_sheet(wb, ws, "Data Export");
            XLSX.writeFile(wb, fileName);
            Swal.close();
        }).getAllDataForExport(type);
}

// ==========================================================
// 🔍 PERBAIKAN FITUR FILTER TABEL (ANTI NGADAT)
// ==========================================================

// 1. Filter Buku (Presisi 100%)
window.applyFilterBuku = function () {
    const tahun = document.getElementById('filterTahunExport').value.trim();
    const searchBox = document.querySelector('#page-buku .custom-search input');
    if (searchBox) searchBox.value = '';

    bookPage = 1;
    // Kirim sandi 'exact_tahun:' ke server
    const query = tahun ? "exact_tahun:" + tahun : "";
    loadBooks(query);
};

// 2. Ambil Kelas Otomatis dari Database
window.initDropdownKelas = function () {
    google.script.run.withSuccessHandler(data => {
        const select = document.getElementById('filterKelasExport');
        if (!select) return;

        // Ambil data kelas dari kolom ke-2, saring yang kosong, urutkan A-Z
        const uniqueKelas = [...new Set(data.map(item => String(item[2]).trim()))].filter(Boolean).sort();

        select.innerHTML = '<option value="">-- Semua Kelas --</option>';
        uniqueKelas.forEach(k => {
            select.innerHTML += `<option value="${k}">${k}</option>`;
        });
    }).getAllDataForExport('anggota');
};

// 3. Filter Anggota (Presisi 100%)
window.applyFilterAnggota = function () {
    const kelas = document.getElementById('filterKelasExport').value.trim();
    const searchBox = document.querySelector('#page-anggota .custom-search input');
    if (searchBox) searchBox.value = '';

    memberPage = 1;
    document.getElementById('member-list-body').innerHTML = '<tr><td colspan="6" class="text-center py-5"><div class="spinner-border text-success" role="status"></div><div class="mt-2 text-muted small">Menyaring Kelas...</div></td></tr>';

    // Kirim sandi 'exact_kelas:' ke server
    const query = kelas ? "exact_kelas:" + kelas : "";
    loadMembers(query);
};

// ==========================================================
// 📲 LOGIKA BANNER INSTALL PWA PROFESIONAL
// ==========================================================
let deferredPrompt;

// 1. Tangkap izin instalasi dari browser
window.addEventListener('beforeinstallprompt', (e) => {
    // Mencegah popup default browser (mini-infobar)
    e.preventDefault();
    deferredPrompt = e;

    // Cek apakah user sebelumnya sudah menutup banner ini
    if (sessionStorage.getItem('pwa_banner_closed')) {
        return; // Jika sudah pernah ditutup, jangan tampilkan lagi
    }

    // Update teks banner sesuai ID tenant/sekolah saat ini
    const urlParamsPWA = new URLSearchParams(window.location.search);
    let tenantIdPWA = urlParamsPWA.get('id') || localStorage.getItem('siempus_tenant_id') || 'Demo';

    document.getElementById('pwa-banner-title').innerText = "SiE-MPuS " + tenantIdPWA.toUpperCase();

    // Update logo jika logo sekolah sudah diload dari backend
    if (typeof globalLogoUrl !== 'undefined' && globalLogoUrl !== '') {
        document.getElementById('pwa-banner-logo').src = globalLogoUrl;
    }

    // Munculkan banner dengan animasi meluncur dari bawah
    setTimeout(() => {
        const banner = document.getElementById('pwa-install-banner');
        if (banner) banner.style.transform = 'translateY(0)';
    }, 1500); // Tunda 1.5 detik biar aplikasinya loading dulu
});

// 2. Aksi jika tombol "Install" diklik
document.getElementById('btn-pwa-install').addEventListener('click', async () => {
    if (deferredPrompt) {
        // Panggil sistem popup install Android/Browser
        deferredPrompt.prompt();

        // Tunggu respon user
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            console.log('User menginstal aplikasi');
        }

        // Sembunyikan banner ke bawah
        document.getElementById('pwa-install-banner').style.transform = 'translateY(150%)';
        deferredPrompt = null;
    }
});

// 3. Aksi jika tombol "X" (Tutup) diklik
document.getElementById('btn-pwa-close').addEventListener('click', () => {
    // Sembunyikan banner
    document.getElementById('pwa-install-banner').style.transform = 'translateY(150%)';

    // Simpan ingatan ke browser agar tidak muncul lagi saat pindah halaman
    sessionStorage.setItem('pwa_banner_closed', 'true');
});

// 4. Deteksi jika aplikasi sudah sukses terinstal
window.addEventListener('appinstalled', () => {
    // Sembunyikan banner permanen
    document.getElementById('pwa-install-banner').style.transform = 'translateY(150%)';

    // Tampilkan notifikasi sukses
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Aplikasi berhasil ditambahkan ke Layar Utama!',
        showConfirmButton: false,
        timer: 3000
    });
});



document.addEventListener("DOMContentLoaded", () => {
    // 1. Ambil ID Tenant (Sekolah) dari URL atau LocalStorage
    const urlParamsPWA = new URLSearchParams(window.location.search);
    let tenantIdPWA = urlParamsPWA.get('id') || localStorage.getItem('siempus_tenant_id') || 'demo';

    // 2. Buat Manifest secara Dinamis (Lengkap & Profesional)
    const dynamicManifest = {
        "name": "SiE-MPuS - " + tenantIdPWA.toUpperCase(),
        "short_name": "SiE-MPuS",
        "description": "Sistem E-Manajemen Perpustakaan Sekolah",
        "start_url": window.location.pathname + "?id=" + tenantIdPWA,
        "display": "standalone",
        "background_color": "#f0f2f5",
        "theme_color": "#4361ee",
        "orientation": "portrait-primary",
        "icons": [
            {
                "src": "./imgsiempus.png",
                "sizes": "72x72",
                "type": "image/png"
            },
            {
                "src": "./imgsiempus.png",
                "sizes": "96x96",
                "type": "image/png"
            },
            {
                "src": "./imgsiempus.png",
                "sizes": "128x128",
                "type": "image/png"
            },
            {
                "src": "./imgsiempus.png",
                "sizes": "144x144",
                "type": "image/png"
            },
            {
                "src": "./imgsiempus.png",
                "sizes": "152x152",
                "type": "image/png"
            },
            {
                "src": "./imgsiempus.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any maskable"
            },
            {
                "src": "./imgsiempus.png",
                "sizes": "384x384",
                "type": "image/png"
            },
            {
                "src": "./imgsiempus.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "any maskable"
            }
        ]
    };

    // 3. Ubah objek JSON menjadi File Virtual agar terbaca PWABuilder
    const manifestBlob = new Blob([JSON.stringify(dynamicManifest)], { type: 'application/json' });
    const manifestUrl = URL.createObjectURL(manifestBlob);

    // 4. Suntikkan ke dalam tag <head>
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = manifestUrl;
    document.head.appendChild(manifestLink);

    // 5. Daftarkan Service Worker (sw.js)
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('PWA: Service Worker Aktif!', registration.scope);
                })
                .catch(err => {
                    console.log('PWA: Gagal mendaftarkan Service Worker:', err);
                });
        });
    }
});

// ==========================================================
// FITUR BACKUP & RESTORE ONLINE
// ==========================================================
async function backupDataJSON() {
    try {
        Swal.fire({ title: 'Menyiapkan Backup Online...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
        
        google.script.run
            .withSuccessHandler(function(response) {
                if(response.status) {
                    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(response.data));
                    const downloadAnchorNode = document.createElement('a');
                    downloadAnchorNode.setAttribute('href', dataStr);
                    downloadAnchorNode.setAttribute('download', 'backup_siempus_online_' + new Date().getTime() + '.json');
                    document.body.appendChild(downloadAnchorNode);
                    downloadAnchorNode.click();
                    downloadAnchorNode.remove();
                    Swal.fire('Berhasil!', 'Data online berhasil dibackup.', 'success');
                } else {
                    Swal.fire('Gagal!', 'Terjadi kesalahan: ' + response.message, 'error');
                }
            })
            .withFailureHandler(function(error) {
                console.error(error);
                Swal.fire('Error!', 'Gagal menghubungi server.', 'error');
            })
            .getAllBackupData();
            
    } catch(e) {
        console.error('Backup gagal', e);
        Swal.fire('Gagal!', 'Terjadi kesalahan saat backup: ' + e.message, 'error');
    }
}

async function restoreDataJSON(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const backupData = JSON.parse(e.target.result);
            if (typeof backupData !== 'object') {
                Swal.fire('Gagal!', 'Format file JSON tidak valid!', 'error');
                return;
            }
            Swal.fire({
                title: 'Konfirmasi Restore',
                text: 'Semua data ONLINE akan ditimpa dengan data dari file backup. Proses ini mungkin memakan waktu lama. Anda yakin?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Ya, Restore!'
            }).then((result) => {
                if (result.isConfirmed) {
                    Swal.fire({ title: 'Merestore Data Online...', text: 'Mohon tunggu, ini bisa memakan waktu beberapa menit...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
                    
                    google.script.run
                        .withSuccessHandler(function(response) {
                            if(response.status) {
                                Swal.fire('Berhasil!', 'Data online berhasil direstore. Halaman akan dimuat ulang.', 'success').then(() => {
                                    window.location.reload();
                                });
                            } else {
                                Swal.fire('Gagal!', 'Terjadi kesalahan: ' + response.message, 'error');
                            }
                        })
                        .withFailureHandler(function(error) {
                            console.error(error);
                            Swal.fire('Error!', 'Gagal menghubungi server saat restore.', 'error');
                        })
                        .restoreBackupData(backupData);
                }
            });
        } catch (err) {
            console.error('Restore gagal', err);
            Swal.fire('Gagal!', 'Gagal membaca atau memproses file backup: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    input.value = ''; // Reset input
}

