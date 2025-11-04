// scripts.js - ES6 Module Version

// --- 1. Impor Firebase SDK ---
// Impor fungsi-fungsi yang dibutuhkan dari Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    writeBatch,
    getDocs,
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Impor jsPDF dan html2canvas (pastikan CDN ini juga di-load di HTML sebelum skrip ini)
// Konfigurasi jsPDF umumnya dilakukan setelah DOM siap, atau bisa ditempatkan di sini jika diperlukan secara global.
// window.jspdf dan window.html2canvas diasumsikan tersedia dari CDN yang dimuat di HTML.

// --- 2. Konfigurasi Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyCQqq5nJS5l-F3Tk1gYpfFSbBt1IKc-GPI",
    authDomain: "db-v2-jaganetwork.firebaseapp.com",
    projectId: "db-v2-jaganetwork",
    storageBucket: "db-v2-jaganetwork.firebasestorage.app",
    messagingSenderId: "377939885595",
    appId: "1:377939885595:web:adc0584a31004523ddc2be",
    measurementId: "G-Z9FRDEWZTJ"
};

// --- 3. Inisialisasi Firebase App dan Services ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app); // Gunakan auth dari modular API
const db = getFirestore(app); // Gunakan db dari modular API

// --- 4. Konstanta dan Variabel Global ---
const dataContainerPath = "jaganetwork_data/shared_workspace";
const getCollectionRef = (name) => collection(db, dataContainerPath, name); // Gunakan collection dari modular API
const categoryColors = {
    'tagihan': '#3b82f6',
    'maintenance': '#f97316',
    'janji-temu': '#22c55e',
    'umum': '#6b7280'
};

// Stack/Queue untuk Undo dan Toast
const toastQueue = [];
let isToastVisible = false;
const undoStack = [];
let undoCommitTimer = null;

// Referensi Elemen DOM (akan diinisialisasi setelah DOM siap)
let authContainer, appContainer;

// Data Global
let allCustomers = [], allPackages = [], allInvoices = [], allExpenses = [], allNetworkStatus = [], allBlogPosts = [];
let unsubscribeCustomers, unsubscribePackages, unsubscribeInvoices, unsubscribeExpenses, unsubscribeNetworkStatus, unsubscribeBlogPosts, unsubscribeCalendarEvents;
let verificationInvoiceId = null;
let chatContext = {};

// Pencarian dan Filter
let customerSearchTerm = '', customerPackageFilter = 'semua';
let customerStatusFilter = 'semua'; // Tambahkan ini
let invoiceSearchTerm = '', invoiceStatusFilter = 'semua';

// Pagination
let pelangganCurrentPage = 1, pelangganItemsPerPage = 10;
let tagihanCurrentPage = 1, tagihanItemsPerPage = 10;

// Chart Instances
let lineChartInstance, pieChartInstance;
let analyticsInitialized = false;

// --- 5. Fungsi-fungsi Utama ---
// (Fungsi-fungsi seperti saveCustomer, deleteCustomer, renderCustomers, dll.)
// Harus didefinisikan sebelum digunakan atau dipanggil.

// Fungsi CRUD (Contoh untuk Pelanggan)
async function saveCustomer(customerData) {
    try {
        const collectionRef = getCollectionRef('customers');
        if (customerData.id) {
            await updateDoc(doc(db, dataContainerPath, 'customers', customerData.id), customerData);
            showToast("Data pelanggan berhasil diperbarui.");
        } else {
            // Jika status tidak diset, default ke 'Aktif'
            if (!customerData.status) customerData.status = 'Aktif';
            await addDoc(collectionRef, customerData);
            showToast("Pelanggan baru berhasil ditambahkan.");
        }
        closeModal(document.getElementById('modal-pelanggan'));
    } catch (error) {
        console.error("Error saving customer:", error);
        showToast("Gagal menyimpan data pelanggan.", "error");
    }
}

async function deleteCustomer(id) {
    try {
        await deleteDoc(doc(db, dataContainerPath, 'customers', id));
        // Tidak perlu toast di sini karena akan ditangani oleh Undo Toast di event listener
    } catch (e) {
        console.error("Error deleting customer:", e);
        showToast("Gagal menghapus pelanggan.", "error");
    }
}

// Fungsi untuk menghapus data lainnya (Paket, Tagihan, dll.) mengikuti pola yang sama
// ... (savePaket, deletePaket, saveInvoice, deleteInvoice, dll.) ...

// Fungsi Render (Contoh untuk Pelanggan)
function renderCustomers() {
    const tbody = document.getElementById('pelanggan-table-body');
    let filteredCustomers = [...allCustomers];

    // Terapkan pencarian dan filter
    if (customerSearchTerm) {
        const lower = customerSearchTerm.toLowerCase();
        filteredCustomers = filteredCustomers.filter(c =>
            c.nama.toLowerCase().includes(lower) || (c.customerId && c.customerId.includes(lower))
        );
    }
    if (customerPackageFilter !== 'semua') {
        filteredCustomers = filteredCustomers.filter(c => c.paketId === customerPackageFilter);
    }
    // Tambahkan filter status di sini
    if (customerStatusFilter !== 'semua') {
        filteredCustomers = filteredCustomers.filter(c => c.status === customerStatusFilter);
    }

    // Hitung pagination
    const totalItems = filteredCustomers.length;
    const totalPages = Math.ceil(totalItems / pelangganItemsPerPage) || 1;
    if (pelangganCurrentPage > totalPages) pelangganCurrentPage = totalPages;

    const startIndex = (pelangganCurrentPage - 1) * pelangganItemsPerPage;
    const endIndex = startIndex + pelangganItemsPerPage;
    const paginatedItems = filteredCustomers.slice(startIndex, endIndex);

    if (!paginatedItems.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-gray-500">Tidak ada pelanggan.</td></tr>`; // Ubah colspan ke 8
        updatePaginationControls('pelanggan', 1, 1);
        return;
    }

    tbody.innerHTML = paginatedItems.map(c => {
        const pkg = allPackages.find(p => p.id === c.paketId) || { nama: 'N/A' };
        // Buat elemen badge status
        const statusClass = c.status === 'Aktif' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
        const statusBadge = `<span class="px-2 py-1 text-xs font-medium rounded-full ${statusClass}">${c.status}</span>`;
        return `<tr class="border-b hover:bg-gray-50 transition-all duration-300" id="customer-row-${c.id}">
                    <td class="p-4">${c.customerId || 'N/A'}</td>
                    <td class="p-4">${c.nama}</td>
                    <td class="p-4">${c.alamat}</td>
                    <td class="p-4">${c.hp}</td>
                    <td class="p-4">${pkg.nama}</td>
                    <td class="p-4">${statusBadge}</td> <!-- Kolom Status Baru -->
                    <td class="p-4">${c.joinDate || 'N/A'}</td>
                    <td class="p-4 flex items-center gap-2 sm:gap-3">
                        <button class="btn-chat-pelanggan text-green-600 hover:text-green-800" data-customer-id="${c.id}" title="Kirim WhatsApp">
                            <i data-lucide="message-circle" class="w-5 h-5"></i>
                        </button>
                        <button class="btn-edit-pelanggan text-blue-600 hover:text-blue-800" data-id="${c.id}" title="Edit">
                            <i data-lucide="edit" class="w-5 h-5"></i>
                        </button>
                        <button class="btn-delete-pelanggan text-red-600 hover:text-red-800" data-id="${c.id}" title="Hapus">
                            <i data-lucide="trash-2" class="w-5 h-5"></i>
                        </button>
                    </td>
                </tr>`;
    }).join('');

    updatePaginationControls('pelanggan', pelangganCurrentPage, totalPages);
    lucide.createIcons(); // Refresh ikon setelah render
}

// Fungsi untuk menampilkan Toast
function showToast(message, type = 'info') {
    const msgEl = document.createElement('p');
    msgEl.textContent = message;
    const toast = document.createElement('div');
    toast.appendChild(msgEl);
    toast.className = 'fixed top-5 right-5 text-white py-3 px-6 rounded-lg shadow-lg transform transition-all duration-300 z-50';
    const typeClasses = { error: 'bg-red-600', info: 'bg-blue-600' };
    toast.classList.add(typeClasses[type] || 'bg-gray-800');
    msgEl.textContent = message;
    toast.classList.remove('-translate-y-20', 'opacity-0');

    setTimeout(() => {
        toast.classList.add('-translate-y-20', 'opacity-0');
        setTimeout(() => {
            isToastVisible = false;
            processToastQueue();
        }, 300);
    }, 3000);

    document.body.appendChild(toast);
}

// Fungsi untuk memproses antrian toast
function processToastQueue() {
    if (isToastVisible || toastQueue.length === 0) {
        return;
    }
    isToastVisible = true;
    const { message, type } = toastQueue.shift();
    const toast = document.createElement('div');
    toast.className = 'fixed top-5 right-5 text-white py-3 px-6 rounded-lg shadow-lg transform transition-all duration-300 z-50';
    const typeClasses = { error: 'bg-red-600', info: 'bg-blue-600' };
    toast.classList.add(typeClasses[type] || 'bg-gray-800');
    const msgEl = document.createElement('p');
    msgEl.textContent = message;
    toast.appendChild(msgEl);
    toast.classList.remove('-translate-y-20', 'opacity-0');
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('-translate-y-20', 'opacity-0');
        setTimeout(() => {
            isToastVisible = false;
            processToastQueue();
        }, 300);
    }, 3000);
}

// Fungsi untuk menampilkan Undo Toast
function showUndoToast(action) {
    if (undoCommitTimer) {
        clearTimeout(undoCommitTimer);
        commitLastUndo();
    }
    undoStack.push(action);
    const undoToastEl = document.getElementById('undo-toast');
    document.getElementById('undo-message').textContent = action.message;
    undoToastEl.classList.remove('translate-y-20', 'opacity-0');
    undoCommitTimer = setTimeout(() => commitLastUndo(), 5000);
}

function commitLastUndo() {
    if (undoStack.length === 0) return;
    const lastAction = undoStack.shift();
    if (lastAction && typeof lastAction.commit === 'function') lastAction.commit();
    clearTimeout(undoCommitTimer);
    undoCommitTimer = null;
}

// Fungsi untuk format Rupiah
function formatRupiah(angka) {
    if (isNaN(angka)) return 'Rp 0';
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(angka);
}

// Fungsi untuk format Nomor HP (untuk WhatsApp)
function formatPhoneNumber(phoneNumber) {
    const cleaned = ('' + phoneNumber).replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        return '62' + cleaned.substring(1);
    } else if (cleaned.startsWith('62')) {
        return cleaned;
    } else {
        return cleaned.length >= 10 ? cleaned : null;
    }
}

// Fungsi lainnya (setupTabListeners, setupModalListeners, dll.)
// ... (Semua fungsi yang sebelumnya ada di file Anda) ...

// Fungsi Otentikasi
function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    signInWithEmailAndPassword(auth, email, password) // Gunakan auth dari modular API
        .then((userCredential) => {
            const user = userCredential.user;
            console.log('Login berhasil:', user.email);
        })
        .catch((error) => {
            const errorCode = error.code;
            const errorMessage = error.message;
            console.error("Login error:", errorCode, errorMessage);
            showToast("Login gagal: " + errorMessage, "error");
        });
}

function handleRegister() {
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;

    createUserWithEmailAndPassword(auth, email, password) // Gunakan auth dari modular API
        .then((userCredential) => {
            const user = userCredential.user;
            console.log('Register berhasil:', user.email);
        })
        .catch((error) => {
            const errorCode = error.code;
            const errorMessage = error.message;
            console.error("Register error:", errorCode, errorMessage);
            showToast("Register gagal: " + errorMessage, "error");
        });
}

function handleLogout() {
    signOut(auth) // Gunakan auth dari modular API
        .then(() => {
            document.getElementById('loading-overlay').classList.remove('hidden');
            appContainer.classList.add('hidden'); // Sembunyikan dashboard
            authContainer.classList.remove('hidden'); // Tampilkan login
            document.body.classList.remove('no-scroll');

            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }).catch(error => {
            console.error("Logout error:", error);
            showToast("Gagal logout: " + error.message, "error");
            document.getElementById('loading-overlay').classList.add('hidden');
        });
}

// Fungsi Manajemen Data
async function loadData() {
    cleanupSubscriptions();

    const qCustomers = query(getCollectionRef('customers'), orderBy('nama'));
    unsubscribeCustomers = onSnapshot(qCustomers, (snapshot) => { // Gunakan onSnapshot dari modular API
        allCustomers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateDashboard();
        renderCustomers();
        renderLaporan();
        calculateAnalytics({ customers: allCustomers, packages: allPackages, invoices: allInvoices, expenses: allExpenses });
        if (analyticsInitialized) prepareChartData({ customers: allCustomers, packages: allPackages, invoices: allInvoices, expenses: allExpenses });
    });

    const qPackages = query(getCollectionRef('packages'), orderBy('nama'));
    unsubscribePackages = onSnapshot(qPackages, (snapshot) => {
        allPackages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderPackages();
        renderLaporan();
        calculateAnalytics({ customers: allCustomers, packages: allPackages, invoices: allInvoices, expenses: allExpenses });
        if (analyticsInitialized) prepareChartData({ customers: allCustomers, packages: allPackages, invoices: allInvoices, expenses: allExpenses });
        populatePaketFilter();
    });

    const qInvoices = query(getCollectionRef('invoices'), orderBy('periode'));
    unsubscribeInvoices = onSnapshot(qInvoices, (snapshot) => {
        allInvoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateDashboard();
        renderInvoices(); // Panggil fungsi renderInvoices
        renderLaporan();
        calculateAnalytics({ customers: allCustomers, packages: allPackages, invoices: allInvoices, expenses: allExpenses });
        if (analyticsInitialized) prepareChartData({ customers: allCustomers, packages: allPackages, invoices: allInvoices, expenses: allExpenses });
    });

    const qExpenses = query(getCollectionRef('expenses'), orderBy('tanggal'));
    unsubscribeExpenses = onSnapshot(qExpenses, (snapshot) => {
        allExpenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateDashboard();
        renderExpenses(); // Panggil fungsi renderExpenses
        renderLaporan();
        calculateAnalytics({ customers: allCustomers, packages: allPackages, invoices: allInvoices, expenses: allExpenses });
        if (analyticsInitialized) prepareChartData({ customers: allCustomers, packages: allPackages, invoices: allInvoices, expenses: allExpenses });
    });

    const qNetworkStatus = query(getCollectionRef('network_status'), orderBy('timestamp', 'desc'));
    unsubscribeNetworkStatus = onSnapshot(qNetworkStatus, (snapshot) => {
        allNetworkStatus = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderNetworkStatus(); // Panggil fungsi renderNetworkStatus
    });

    const qBlogPosts = query(getCollectionRef('articles'), orderBy('createdAt', 'desc'));
    unsubscribeBlogPosts = onSnapshot(qBlogPosts, (snapshot) => {
        allBlogPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderBlogPosts(); // Panggil fungsi renderBlogPosts
    });

    loadCalendarEventsForWidget(); // Ganti dengan fungsi yang benar
}

function cleanupSubscriptions() {
    if (unsubscribeCustomers) unsubscribeCustomers();
    if (unsubscribePackages) unsubscribePackages();
    if (unsubscribeInvoices) unsubscribeInvoices();
    if (unsubscribeExpenses) unsubscribeExpenses();
    if (unsubscribeNetworkStatus) unsubscribeNetworkStatus();
    if (unsubscribeBlogPosts) unsubscribeBlogPosts();
    if (unsubscribeCalendarEvents) unsubscribeCalendarEvents();
    if (undoCommitTimer) clearTimeout(undoCommitTimer);
    undoStack.length = 0;
    document.getElementById('undo-toast').classList.add('translate-y-20', 'opacity-0');
    if (lineChartInstance) lineChartInstance.destroy();
    if (pieChartInstance) pieChartInstance.destroy();
    lineChartInstance = null;
    pieChartInstance = null;
}

// Fungsi Update Dashboard
function updateDashboard() {
    const activeCustomers = allCustomers.filter(c => c.status === 'Aktif');
    // Gunakan pengecekan null sebelum mengakses elemen
    const kpiTotalCustomersEl = document.getElementById('kpi-total-customers');
    if (kpiTotalCustomersEl) kpiTotalCustomersEl.textContent = activeCustomers.length;

    const pendingInvoices = allInvoices.filter(inv => inv.status === 'belum lunas').length;
    const kpiPendingInvoicesEl = document.getElementById('kpi-pending-invoices');
    if (kpiPendingInvoicesEl) kpiPendingInvoicesEl.textContent = pendingInvoices;

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const currentMonthInvoices = allInvoices.filter(inv => {
        const invDate = new Date(inv.periode);
        return invDate.getMonth() === currentMonth && invDate.getFullYear() === currentYear;
    });
    const totalInvoicesThisMonth = currentMonthInvoices.reduce((sum, inv) => sum + inv.jumlah, 0);
    const kpiCurrentMonthInvoicesEl = document.getElementById('kpi-current-month-invoices');
    if (kpiCurrentMonthInvoicesEl) kpiCurrentMonthInvoicesEl.textContent = formatRupiah(totalInvoicesThisMonth);

    const revenueThisMonth = currentMonthInvoices.filter(inv => inv.status === 'lunas').reduce((sum, inv) => sum + inv.jumlah, 0);
    const kpiCurrentMonthRevenueEl = document.getElementById('kpi-current-month-revenue');
    if (kpiCurrentMonthRevenueEl) kpiCurrentMonthRevenueEl.textContent = formatRupiah(revenueThisMonth);
}

// Fungsi Render Laporan
function renderLaporan() {
    const bulanEl = document.getElementById('laporan-filter-bulan');
    const tahunEl = document.getElementById('laporan-filter-tahun');
    const bulan = parseInt(bulanEl.value);
    const tahun = parseInt(tahunEl.value);

    const filteredInvoices = allInvoices.filter(inv => {
        const d = new Date(inv.periode);
        return d.getMonth() === bulan && d.getFullYear() === tahun;
    });
    const filteredExpenses = allExpenses.filter(e => {
        const d = new Date(e.tanggal);
        return d.getMonth() === bulan && d.getFullYear() === tahun;
    });

    const totalRevenue = filteredInvoices.filter(inv => inv.status === 'lunas').reduce((sum, inv) => sum + inv.jumlah, 0);
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.jumlah, 0);
    const profit = totalRevenue - totalExpenses;

    // Gunakan pengecekan null sebelum mengakses elemen
    const kpiReportRevenueEl = document.getElementById('kpi-report-revenue');
    if (kpiReportRevenueEl) kpiReportRevenueEl.textContent = formatRupiah(totalRevenue);

    const kpiReportExpensesEl = document.getElementById('kpi-report-expenses');
    if (kpiReportExpensesEl) kpiReportExpensesEl.textContent = formatRupiah(totalExpenses);

    const kpiReportProfitEl = document.getElementById('kpi-report-profit');
    if (kpiReportProfitEl) kpiReportProfitEl.textContent = formatRupiah(profit);

    const pemasukanTbody = document.getElementById('laporan-pemasukan-table-body');
    if (filteredInvoices.length === 0) {
        pemasukanTbody.innerHTML = `<tr><td colspan="3" class="p-8 text-center text-gray-500">Tidak ada data pemasukan untuk periode ini.</td></tr>`;
    } else {
        pemasukanTbody.innerHTML = filteredInvoices.filter(inv => inv.status === 'lunas').map(inv => {
            const customer = allCustomers.find(c => c.id === inv.pelangganId) || { nama: 'N/A' };
            return `
            <tr class="border-b">
                <td class="p-4">${customer.nama}</td>
                <td class="p-4">${inv.periode}</td>
                <td class="p-4">${formatRupiah(inv.jumlah)}</td>
            </tr>
            `;
        }).join('');
    }

    const pengeluaranTbody = document.getElementById('laporan-pengeluaran-table-body');
    if (filteredExpenses.length === 0) {
        pengeluaranTbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-500">Tidak ada data pengeluaran untuk periode ini.</td></tr>`;
    } else {
        pengeluaranTbody.innerHTML = filteredExpenses.map(e => {
            const statusClass = e.kategori === 'tagihan' ? 'bg-blue-100 text-blue-800' :
                               e.kategori === 'maintenance' ? 'bg-orange-100 text-orange-800' :
                               e.kategori === 'janji-temu' ? 'bg-green-100 text-green-800' :
                               'bg-gray-100 text-gray-800';
            return `
            <tr class="border-b">
                <td class="p-4">${e.tanggal}</td>
                <td class="p-4">
                    <span class="px-2 py-1 text-xs font-medium rounded-full ${statusClass}">${e.kategori}</span>
                </td>
                <td class="p-4">${e.deskripsi}</td>
                <td class="p-4">${formatRupiah(e.jumlah)}</td>
            </tr>
            `;
        }).join('');
    }
}

// Fungsi lainnya seperti renderPackages, renderInvoices, renderExpenses, renderNetworkStatus, renderBlogPosts, populateLaporanDateFilters, calculateAnalytics, prepareChartData, loadCalendarEvents, setupTabListeners, setupModalListeners, setupFormListeners, setupOtherListeners, showContent, closeModal, openModal, updatePaginationControls, populatePaketFilter, populatePaketSelect, savePaket, deletePaket, saveInvoice, deleteInvoice, saveExpense, deleteExpense, saveNetworkStatus, deleteNetworkStatus, saveBlogPost, deleteBlogPost, generateInvoices, exportToCsv, exportPelangganToCsv, exportTagihanToCsv, populatePaketSelect, dll. perlu Anda salin dari file sebelumnya dan pastikan menggunakan fungsi modular API (doc, collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, where, getDocs, writeBatch, serverTimestamp) dan variabel global yang telah didefinisikan di atas.

// Contoh renderPackages
function renderPackages() {
    const tbody = document.getElementById('paket-table-body');
    if (!allPackages.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500">Tidak ada paket.</td></tr>`;
        return;
    }
    tbody.innerHTML = allPackages.map(p => `
        <tr class="border-b hover:bg-gray-50 transition-all duration-300" id="paket-row-${p.id}">
            <td class="p-4">${p.nama}</td>
            <td class="p-4">${p.kecepatan} Mbps</td>
            <td class="p-4">${formatRupiah(p.harga)}</td>
            <td class="p-4">${formatRupiah(p.hargaProrate)}</td>
            <td class="p-4 flex gap-3">
                <button class="btn-edit-paket text-blue-600 hover:text-blue-800" data-id="${p.id}" title="Edit">
                    <i data-lucide="edit" class="w-5 h-5"></i>
                </button>
                <button class="btn-delete-paket text-red-600 hover:text-red-800" data-id="${p.id}" title="Hapus">
                    <i data-lucide="trash-2" class="w-5 h-5"></i>
                </button>
            </td>
        </tr>
    `).join('');
    lucide.createIcons();
}

// Contoh savePaket
async function savePaket(paketData) {
    try {
        const collectionRef = getCollectionRef('packages');
        if (paketData.id) {
            await updateDoc(doc(db, dataContainerPath, 'packages', paketData.id), paketData);
            showToast("Data paket berhasil diperbarui.");
        } else {
            await addDoc(collectionRef, paketData);
            showToast("Paket baru berhasil ditambahkan.");
        }
        closeModal(document.getElementById('modal-paket'));
    } catch (error) {
        console.error("Error saving package:", error);
        showToast("Gagal menyimpan data paket.", "error");
    }
}

// Contoh deletePaket
async function deletePaket(id) {
    const isUsed = allCustomers.some(c => c.paketId === id);
    if (isUsed) {
        showToast("Tidak bisa menghapus paket yang sedang digunakan oleh pelanggan.", "error");
        const row = document.getElementById(`paket-row-${id}`);
        if (row) row.style.display = '';
        return;
    }
    try {
        await deleteDoc(doc(db, dataContainerPath, 'packages', id));
    } catch (e) {
        console.error("Error deleting package:", e);
        showToast("Gagal menghapus paket.", "error");
    }
}

// --- Fungsi Render Lainnya (Ditambahkan untuk memperbaiki error) ---

// Contoh renderInvoices (pastikan ID tbody sesuai dengan index.html Anda)
function renderInvoices() {
    const tbody = document.getElementById('tagihan-table-body'); // Ganti dengan ID yang benar dari index.html
    if (!tbody) {
        console.warn("Element tbody untuk tagihan tidak ditemukan saat renderInvoices.");
        return;
    }
    if (!allInvoices.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500">Tidak ada tagihan.</td></tr>`; // Sesuaikan colspan
        return;
    }

    // Logika filter dan pagination bisa diterapkan di sini seperti renderCustomers
    tbody.innerHTML = allInvoices.map(inv => {
        const customer = allCustomers.find(c => c.id === inv.pelangganId) || { nama: 'N/A' };
        const statusClass = inv.status === 'lunas' ? 'bg-green-100 text-green-800' :
                           inv.status === 'belum lunas' ? 'bg-red-100 text-red-800' :
                           'bg-yellow-100 text-yellow-800';
        return `
        <tr class="border-b hover:bg-gray-50 transition-all duration-300" id="invoice-row-${inv.id}">
            <td class="p-4">${customer.nama}</td>
            <td class="p-4">${inv.periode}</td>
            <td class="p-4">${formatRupiah(inv.jumlah)}</td>
            <td class="p-4">
                <span class="px-2 py-1 text-xs font-medium rounded-full ${statusClass}">${inv.status}</span>
            </td>
            <td class="p-4 flex gap-3">
                <button class="btn-edit-tagihan text-blue-600 hover:text-blue-800" data-id="${inv.id}" title="Edit">
                    <i data-lucide="edit" class="w-5 h-5"></i>
                </button>
                <button class="btn-delete-tagihan text-red-600 hover:text-red-800" data-id="${inv.id}" title="Hapus">
                    <i data-lucide="trash-2" class="w-5 h-5"></i>
                </button>
            </td>
        </tr>
        `;
    }).join('');
    lucide.createIcons(); // Refresh ikon setelah render
}

// Contoh renderExpenses (pastikan ID tbody sesuai dengan index.html Anda)
function renderExpenses() {
    const tbody = document.getElementById('pengeluaran-table-body'); // Ganti dengan ID yang benar dari index.html
    if (!tbody) {
        console.warn("Element tbody untuk pengeluaran tidak ditemukan saat renderExpenses.");
        return;
    }
    if (!allExpenses.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500">Tidak ada pengeluaran.</td></tr>`; // Sesuaikan colspan
        return;
    }
    tbody.innerHTML = allExpenses.map(e => {
        const statusClass = e.kategori === 'tagihan' ? 'bg-blue-100 text-blue-800' :
                           e.kategori === 'maintenance' ? 'bg-orange-100 text-orange-800' :
                           e.kategori === 'janji-temu' ? 'bg-green-100 text-green-800' :
                           'bg-gray-100 text-gray-800';
        return `
        <tr class="border-b hover:bg-gray-50 transition-all duration-300" id="expense-row-${e.id}">
            <td class="p-4">${e.tanggal}</td>
            <td class="p-4">
                <span class="px-2 py-1 text-xs font-medium rounded-full ${statusClass}">${e.kategori}</span>
            </td>
            <td class="p-4">${e.deskripsi}</td>
            <td class="p-4">${formatRupiah(e.jumlah)}</td>
            <td class="p-4 flex gap-3">
                <button class="btn-edit-pengeluaran text-blue-600 hover:text-blue-800" data-id="${e.id}" title="Edit">
                    <i data-lucide="edit" class="w-5 h-5"></i>
                </button>
                <button class="btn-delete-pengeluaran text-red-600 hover:text-red-800" data-id="${e.id}" title="Hapus">
                    <i data-lucide="trash-2" class="w-5 h-5"></i>
                </button>
            </td>
        </tr>
        `;
    }).join('');
    lucide.createIcons();
}

// Contoh renderNetworkStatus (pastikan ID tbody sesuai dengan index.html Anda)
function renderNetworkStatus() {
    const tbody = document.getElementById('status-jaringan-table-body'); // Ganti dengan ID yang benar dari index.html
    if (!tbody) {
        console.warn("Element tbody untuk status jaringan tidak ditemukan saat renderNetworkStatus.");
        return;
    }
    if (!allNetworkStatus.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-500">Tidak ada status jaringan.</td></tr>`; // Sesuaikan colspan
        return;
    }
    tbody.innerHTML = allNetworkStatus.map(s => {
        const statusClasses = {
            'Normal': 'bg-green-100 text-green-800',
            'Gangguan Sebagian': 'bg-yellow-100 text-yellow-800',
            'Gangguan Umum': 'bg-red-100 text-red-800',
            'Tidak Diketahui': 'bg-gray-100 text-gray-800'
        };
        const timestamp = s.timestamp?.toDate ? s.timestamp.toDate().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A';
        return `
        <tr class="border-b hover:bg-gray-50 transition-all duration-300" id="status-row-${s.id}">
            <td class="p-4">${timestamp}</td>
            <td class="p-4">
                <span class="px-2 py-1 text-xs font-medium rounded-full ${statusClasses[s.status] || statusClasses['Tidak Diketahui']}">${s.status}</span>
            </td>
            <td class="p-4">${s.description}</td>
            <td class="p-4 flex gap-3">
                <button class="btn-edit-status-jaringan text-blue-600 hover:text-blue-800" data-id="${s.id}" title="Edit">
                    <i data-lucide="edit" class="w-5 h-5"></i>
                </button>
                <button class="btn-delete-status-jaringan text-red-600 hover:text-red-800" data-id="${s.id}" title="Hapus">
                    <i data-lucide="trash-2" class="w-5 h-5"></i>
                </button>
            </td>
        </tr>
        `;
    }).join('');
    lucide.createIcons();
}

// Contoh renderBlogPosts (pastikan ID tbody sesuai dengan index.html Anda)
function renderBlogPosts() {
    const tbody = document.getElementById('artikel-table-body'); // Ganti dengan ID yang benar dari index.html
    if (!tbody) {
        console.warn("Element tbody untuk artikel tidak ditemukan saat renderBlogPosts.");
        return;
    }
    if (!allBlogPosts.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-8 text-center text-gray-500">Tidak ada artikel.</td></tr>`; // Sesuaikan colspan
        return;
    }
    tbody.innerHTML = allBlogPosts.map(p => {
        const date = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('id-ID') : 'N/A';
        return `
        <tr class="border-b hover:bg-gray-50 transition-all duration-300" id="blog-row-${p.id}">
            <td class="p-4">${p.title}</td>
            <td class="p-4">${p.author}</td>
            <td class="p-4">${date}</td>
            <td class="p-4 flex gap-3">
                <button class="btn-edit-artikel text-blue-600 hover:text-blue-800" data-id="${p.id}" title="Edit">
                    <i data-lucide="edit" class="w-5 h-5"></i>
                </button>
                <button class="btn-delete-artikel text-red-600 hover:text-red-800" data-id="${p.id}" title="Hapus">
                    <i data-lucide="trash-2" class="w-5 h-5"></i>
                </button>
            </td>
        </tr>
        `;
    }).join('');
    lucide.createIcons();
}

// --- Fungsi Analytics dan Chart ---
// Fungsi untuk menghitung metrik analytics
function calculateAnalytics(data) {
    const { customers, packages, invoices, expenses } = data;
    const today = new Date();
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // --- KPI Dashboard ---
    // Total Pelanggan (sudah dihitung di updateDashboard)
    // Tagihan Bulan Ini (sudah dihitung di updateDashboard)
    // Pendapatan Bulan Ini (sudah dihitung di updateDashboard)
    // Tagihan Belum Lunas (sudah dihitung di updateDashboard)

    // --- KPI Analytics ---
    // Pelanggan Baru Bulan Ini
    const newCustomersThisMonth = customers.filter(c => {
        if (!c.joinDate) return false;
        const joinDate = new Date(c.joinDate);
        return joinDate >= thisMonthStart && joinDate <= thisMonthEnd;
    }).length;
    // Gunakan pengecekan null sebelum mengakses elemen
    const kpiNewCustomersEl = document.getElementById('kpi-new-customers');
    if (kpiNewCustomersEl) kpiNewCustomersEl.textContent = newCustomersThisMonth;

    // Pengeluaran Bulan Ini
    const expensesThisMonth = expenses.filter(exp => {
        if (!exp.tanggal) return false;
        const expDate = new Date(exp.tanggal);
        return expDate >= thisMonthStart && expDate <= thisMonthEnd;
    });
    const totalExpensesThisMonth = expensesThisMonth.reduce((sum, exp) => sum + exp.jumlah, 0);
    // Gunakan pengecekan null sebelum mengakses elemen
    const totalPengeluaranEl = document.getElementById('total-pengeluaran-dashboard');
    if (totalPengeluaranEl) totalPengeluaranEl.textContent = formatRupiah(totalExpensesThisMonth);

    // Pengeluaran Terbesar
    const expensesByCategory = {};
    expenses.forEach(e => {
        expensesByCategory[e.kategori] = (expensesByCategory[e.kategori] || 0) + e.jumlah;
    });
    if (Object.keys(expensesByCategory).length > 0) {
        const [topCategory] = Object.entries(expensesByCategory).sort(([,a], [,b]) => b - a)[0];
        // Gunakan pengecekan null sebelum mengakses elemen
        const kpiTopExpenseCategoryEl = document.getElementById('kpi-top-expense-category');
        if (kpiTopExpenseCategoryEl) kpiTopExpenseCategoryEl.textContent = topCategory;
    } else {
        // Gunakan pengecekan null sebelum mengakses elemen
        const kpiTopExpenseCategoryEl = document.getElementById('kpi-top-expense-category');
        if (kpiTopExpenseCategoryEl) kpiTopExpenseCategoryEl.textContent = '-';
    }
}

// Fungsi untuk menyiapkan data yang akan digunakan oleh Chart.js
function prepareChartData(data) {
    const { customers, packages, invoices, expenses } = data;

    // Inisialisasi objek history untuk 12 bulan terakhir
    const history = {};
    for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // Format: YYYY-MM
        history[monthKey] = {
            revenue: 0,
            profit: 0, // Pendapatan - Pengeluaran
            customers: 0,
            expenses: 0
        };
    }

    // Hitung pendapatan dan pelanggan per bulan
    invoices.forEach(inv => {
        if (!inv.periode || inv.status !== 'lunas') return; // Hanya tagihan lunas yang dihitung
        const d = new Date(inv.periode);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (history[monthKey]) {
            history[monthKey].revenue += inv.jumlah;
        }
    });

    // Hitung pengeluaran per bulan
    expenses.forEach(e => {
        if (!e.tanggal) return;
        const d = new Date(e.tanggal);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (history[monthKey]) {
            history[monthKey].expenses += e.jumlah;
        }
    });

    // Hitung jumlah pelanggan per bulan (jumlah pelanggan di akhir bulan)
    const allJoinDates = [...customers].sort((a, b) => new Date(a.joinDate) - new Date(b.joinDate)).map(c => new Date(c.joinDate));
    Object.keys(history).forEach(monthKey => {
        const [year, month] = monthKey.split('-').map(Number);
        const endOfMonth = new Date(year, month, 0); // Akhir bulan
        const activeCustomersCount = allJoinDates.filter(joinDate => joinDate <= endOfMonth).length;
        history[monthKey].customers = activeCustomersCount;
        history[monthKey].profit = history[monthKey].revenue - history[monthKey].expenses;
    });

    // Hitung pendapatan per paket
    const revenueByPackage = {};
    invoices.filter(inv => inv.status === 'lunas').forEach(inv => {
        const customer = customers.find(c => c.id === inv.pelangganId);
        if (customer) {
            const pkg = packages.find(p => p.id === customer.paketId);
            if (pkg) {
                revenueByPackage[pkg.nama] = (revenueByPackage[pkg.nama] || 0) + inv.jumlah;
            }
        }
    });

    // Hitung pengeluaran per kategori
    const expensesByCategory = {};
    expenses.forEach(e => {
        expensesByCategory[e.kategori] = (expensesByCategory[e.kategori] || 0) + e.jumlah;
    });

    return { history, revenueByPackage, expensesByCategory };
}

// Fungsi untuk menginisialisasi dan merender chart di tab Analytics
function renderAnalyticsCharts(chartData) {
    // Hancurkan instance chart sebelumnya untuk mencegah memory leak
    Object.values(analyticsCharts).forEach(chart => {
        if (chart) chart.destroy();
    });

    const { history, revenueByPackage, expensesByCategory } = chartData;
    const colorPalette = ['#4f46e5', '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#d946ef'];

    const labels = Object.keys(history).map(k => new Date(k + '-02').toLocaleString('id-ID', { month: 'short', year: 'numeric' }));
    const profitData = Object.values(history).map(h => h.profit);
    const revenueData = Object.values(history).map(h => h.revenue);

    // Gabungkan data profit dan revenue untuk menghitung padding skala Y
    const allDataPoints = [...profitData, ...revenueData];
    const dataMax = Math.max(0, ...allDataPoints);
    const dataMin = Math.min(0, ...allDataPoints);
    const padding = (dataMax - dataMin) * 0.1;
    const calculatedMax = dataMax + padding;
    const calculatedMin = dataMin - padding;

    // Chart 1: Pendapatan vs Laba Kotor
    analyticsCharts.revenueProfit = new Chart(document.getElementById('revenue-profit-chart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Pendapatan',
                    data: revenueData,
                    backgroundColor: '#3b82f6'
                },
                {
                    label: 'Laba Kotor',
                    data: profitData,
                    backgroundColor: '#10b981'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: false },
                y: {
                    stacked: false,
                    min: calculatedMin,
                    max: calculatedMax
                }
            }
        }
    });

    // Chart 2: Komposisi Pendapatan per Paket
    analyticsCharts.revenueComp = new Chart(document.getElementById('revenue-composition-chart').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(revenueByPackage),
            datasets: [{
                label: 'Pendapatan',
                data: Object.values(revenueByPackage),
                backgroundColor: colorPalette
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });

    // Chart 3: Pertumbuhan Jumlah Pelanggan
    analyticsCharts.customerGrowth = new Chart(document.getElementById('customer-growth-chart').getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Pelanggan',
                data: Object.values(history).map(h => h.customers),
                borderColor: '#4f46e5',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });

    // Chart 4: Komposisi Pengeluaran per Kategori
    analyticsCharts.expensesComp = new Chart(document.getElementById('expenses-composition-chart').getContext('2d'), {
        type: 'pie',
        data: {
            labels: Object.keys(expensesByCategory),
            datasets: [{
                label: 'Pengeluaran',
                data: Object.values(expensesByCategory),
                backgroundColor: colorPalette.reverse() // Balikkan warna agar berbeda
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// Fungsi untuk menginisialisasi tab Analytics saat pertama kali dibuka
function initAnalytics() {
    const data = { customers: allCustomers, packages: allPackages, invoices: allInvoices, expenses: allExpenses };

    // Jika data belum dimuat, tampilkan loading
    if (data.customers.length === 0 && data.packages.length === 0) {
        document.getElementById('loading-indicator-analytics').style.display = 'block';
        document.getElementById('analytics-content-container').style.display = 'none';
        return;
    }

    // Sembunyikan loading, tampilkan konten
    document.getElementById('loading-indicator-analytics').style.display = 'none';
    document.getElementById('analytics-content-container').style.display = 'block';

    // Update tanggal di header analytics
    document.getElementById('current-date-analytics').textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Hitung analytics dan render chart
    calculateAnalytics(data);
    renderAnalyticsCharts(prepareChartData(data));
    analyticsInitialized = true; // Tandai bahwa analytics telah diinisialisasi
}

// Fungsi Load Calendar Events (untuk widget agenda mendatang di dashboard)
function loadCalendarEventsForWidget() { // Nama fungsi diubah agar lebih spesifik
    const q = query(getCollectionRef('calendar_events')); // Asumsi koleksi disimpan di dataContainerPath

    // Unsubscribe dari listener sebelumnya jika ada
    if (unsubscribeCalendarEvents) unsubscribeCalendarEvents();

    unsubscribeCalendarEvents = onSnapshot(q, (snapshot) => {
        // Ambil semua data acara dari Firestore
        const allRawEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Perbarui widget agenda mendatang dengan data baru
        renderUpcomingEventsWidget(allRawEvents);
    });
}

// Fungsi untuk merender widget agenda mendatang di dashboard
function renderUpcomingEventsWidget(allRawEvents) {
    const listEl = document.getElementById('upcoming-events-widget');
    if (!listEl) return; // Jika elemen tidak ditemukan, hentikan fungsi

    const now = new Date();
    now.setHours(0, 0, 0, 0); // Set waktu ke awal hari (00:00:00) untuk perbandingan yang akurat

    // Filter acara yang mulai dalam 7 hari ke depan (termasuk hari ini)
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(now.getDate() + 7);
    const upcomingEvents = allRawEvents.filter(event => {
        if (!event.start) return false; // Abaikan acara tanpa tanggal mulai
        const startDate = new Date(event.start + 'T00:00:00'); // Format tanggal dari Firestore (YYYY-MM-DD)
        return startDate >= now && startDate <= sevenDaysFromNow;
    }).sort((a, b) => new Date(a.start) - new Date(b.start)); // Urutkan berdasarkan tanggal mulai

    if (upcomingEvents.length === 0) {
        listEl.innerHTML = `<p class="text-gray-500 text-center text-sm py-4">Tidak ada agenda.</p>`;
        return;
    }

    // Render acara ke dalam elemen HTML
    listEl.innerHTML = upcomingEvents.map(event => {
        const startDate = new Date(event.start + 'T00:00:00');
        const dayName = startDate.toLocaleDateString('id-ID', { weekday: 'short' }); // Misal: "Sen"
        const dateFormatted = startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); // Misal: "1 Jan"
        // Gunakan warna berdasarkan kategori acara, atau warna default
        const color = categoryColors[event.category] || categoryColors['umum'];

        return `
        <div class="flex items-start gap-3 text-sm">
            <div class="border-l-4 rounded pl-3 py-1 flex-grow" style="border-color: ${color};">
                <p class="font-semibold text-gray-800">${event.title}</p>
                <p class="text-xs text-gray-600">${dayName}, ${dateFormatted}</p>
            </div>
        </div>
        `;
    }).join('');
}

// ... (Tambahkan fungsi-fungsi lainnya di sini) ...

// Fungsi Generate Tagihan
// ... (Tambahkan fungsi generateInvoices di sini) ...

// Fungsi Export CSV
// ... (Tambahkan fungsi exportToCsv, exportPelangganToCsv, exportTagihanToCsv di sini) ...

// Fungsi Load Calendar Events
// ... (Tambahkan fungsi loadCalendarEvents di sini) ...

// Fungsi Analytics dan Chart
// ... (Tambahkan fungsi calculateAnalytics, prepareChartData, updateCharts, dll. di sini) ...

// --- 6. Inisialisasi Aplikasi ---
// Gunakan DOMContentLoaded untuk memastikan DOM siap sebelum mengakses elemen
document.addEventListener('DOMContentLoaded', () => {
    // Inisialisasi referensi elemen DOM
    authContainer = document.getElementById('auth-container');
    appContainer = document.getElementById('app-container');

    // Inisialisasi ikon Lucide
    lucide.createIcons();

    // Event Listener untuk Tab
    setupTabListeners();
    // Event Listener untuk Modal
    setupModalListeners();
    // Event Listener untuk Form
    setupFormListeners();
    // Event Listener lainnya
    setupOtherListeners();

    // Cek status otentikasi
    onAuthStateChanged(auth, user => { // Gunakan onAuthStateChanged dari modular API
        if (user) {
            appContainer.classList.remove('hidden');
            authContainer.classList.add('hidden');
            loadData();
            document.getElementById('user-email').textContent = user.email;
        } else {
            appContainer.classList.add('hidden');
            authContainer.classList.remove('hidden');
        }
    });
});

// Fungsi setup listeners (contoh sebagian)
function setupTabListeners() {
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = e.target.closest('.tab-item').id.replace('tab-', 'content-');
            showContent(targetId);
        });
    });
}

function setupModalListeners() {
    document.getElementById('btn-add-pelanggan').addEventListener('click', () => {
        document.getElementById('form-pelanggan').reset();
        document.getElementById('pelanggan-id').value = '';
        document.getElementById('id-pelanggan-display').value = 'Akan di-generate otomatis';
        document.getElementById('id-pelanggan-display').readOnly = true;
        document.getElementById('modal-pelanggan-title').textContent = 'Tambah Pelanggan Baru';
        document.getElementById('status-pelanggan').value = 'Aktif';
        openModal(document.getElementById('modal-pelanggan'));
        populatePaketSelect('paket-pelanggan');
    });
    // ... tambahkan listener lainnya ...
}

function setupFormListeners() {
    document.getElementById('form-pelanggan').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('pelanggan-id').value;
        const data = {
            id: id || null,
            customerId: document.getElementById('id-pelanggan-display').value,
            nama: document.getElementById('nama').value,
            alamat: document.getElementById('alamat').value,
            hp: document.getElementById('hp').value,
            paketId: document.getElementById('paket-pelanggan').value,
            joinDate: document.getElementById('join-date').value,
            status: document.getElementById('status-pelanggan').value
        };
        if (!data.id) delete data.id;
        saveCustomer(data);
    });
    // ... tambahkan listener lainnya ...
}

function setupOtherListeners() {
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        handleLogin();
    });

    document.getElementById('show-register').addEventListener('click', (e) => {
        e.preventDefault();
        // Logika untuk menampilkan form register
        document.getElementById('auth-container').innerHTML = `
            <div class="w-full max-w-md bg-white p-8 rounded-xl shadow-md">
                <h2 class="text-2xl font-bold text-center text-gray-800 mb-6">JagaNetwork</h2>
                <div class="mb-6">
                    <h3 class="text-xl font-semibold text-center text-gray-700">Daftar Akun Admin</h3>
                    <p class="text-center text-gray-500 text-sm">Hanya admin yang diizinkan</p>
                </div>
                <form id="register-form" class="space-y-4">
                    <div>
                        <label for="register-email" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input type="email" id="register-email" class="w-full p-2 border rounded-lg" required>
                    </div>
                    <div>
                        <label for="register-password" class="block text-sm font-medium text-gray-700 mb-1">Kata Sandi</label>
                        <input type="password" id="register-password" class="w-full p-2 border rounded-lg" required>
                    </div>
                    <button type="submit" class="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700">Daftar</button>
                </form>
                <div class="mt-6 text-center">
                    <p class="text-sm text-gray-600">Sudah punya akun? <a href="#" id="show-login" class="text-indigo-600 hover:underline">Masuk sekarang</a></p>
                </div>
            </div>
        `;
        document.getElementById('register-form').addEventListener('submit', (e) => {
            e.preventDefault();
            handleRegister();
        });
        document.getElementById('show-login').addEventListener('click', (e) => {
            e.preventDefault();
            // Kembalikan ke form login (Anda bisa menyimpan HTML asli di variabel atau muat ulang dari sumber)
             document.getElementById('auth-container').innerHTML = `
                <div class="w-full max-w-md bg-white p-8 rounded-xl shadow-md">
                    <h2 class="text-2xl font-bold text-center text-gray-800 mb-6">JagaNetwork</h2>
                    <div class="mb-6">
                        <h3 class="text-xl font-semibold text-center text-gray-700">Masuk ke Akun</h3>
                        <p class="text-center text-gray-500 text-sm">Gunakan akun admin untuk mengakses dashboard</p>
                    </div>
                    <form id="login-form" class="space-y-4">
                        <div>
                            <label for="login-email" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                            <input type="email" id="login-email" class="w-full p-2 border rounded-lg" required>
                        </div>
                        <div>
                            <label for="login-password" class="block text-sm font-medium text-gray-700 mb-1">Kata Sandi</label>
                            <input type="password" id="login-password" class="w-full p-2 border rounded-lg" required>
                        </div>
                        <button type="submit" class="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700">Masuk</button>
                    </form>
                    <div class="mt-6 text-center">
                        <p class="text-sm text-gray-600">Belum punya akun? <a href="#" id="show-register" class="text-indigo-600 hover:underline">Daftar sekarang</a></p>
                    </div>
                </div>
            `;
            document.getElementById('login-form').addEventListener('submit', (e) => {
                e.preventDefault();
                handleLogin();
            });
            document.getElementById('show-register').addEventListener('click', (e) => {
                e.preventDefault();
                setupOtherListeners(); // Re-inisialisasi untuk register
            });
        });
    });

    document.getElementById('btn-logout').addEventListener('click', handleLogout);

    // ... tambahkan listener lainnya ...
     // Filter dan Pagination Pelanggan - tambahkan listener untuk status
    document.getElementById('pelanggan-search-input').addEventListener('input', (e) => {
        customerSearchTerm = e.target.value;
        pelangganCurrentPage = 1;
        renderCustomers();
    });
    document.getElementById('pelanggan-paket-filter').addEventListener('change', (e) => {
        customerPackageFilter = e.target.value;
        pelangganCurrentPage = 1;
        renderCustomers();
    });
    // Tambahkan listener untuk filter status
    document.getElementById('pelanggan-status-filter').addEventListener('change', (e) => {
        customerStatusFilter = e.target.value;
        pelangganCurrentPage = 1;
        renderCustomers();
    });
    document.getElementById('pelanggan-per-page').addEventListener('change', e => {
        pelangganItemsPerPage = parseInt(e.target.value, 10);
        pelangganCurrentPage = 1;
        renderCustomers();
    });
    document.getElementById('pelanggan-prev-page').addEventListener('click', () => {
        if (pelangganCurrentPage > 1) {
            pelangganCurrentPage--;
            renderCustomers();
        }
    });
    document.getElementById('pelanggan-next-page').addEventListener('click', () => {
        pelangganCurrentPage++;
        renderCustomers();
    });

    // Filter dan Pagination Tagihan
    document.getElementById('tagihan-search-input').addEventListener('input', (e) => {
        invoiceSearchTerm = e.target.value;
        tagihanCurrentPage = 1;
        renderInvoices();
    });
    document.getElementById('tagihan-status-filter').addEventListener('change', (e) => {
        invoiceStatusFilter = e.target.value;
        tagihanCurrentPage = 1;
        renderInvoices();
    });
    document.getElementById('tagihan-per-page').addEventListener('change', e => {
        tagihanItemsPerPage = parseInt(e.target.value, 10);
        tagihanCurrentPage = 1;
        renderInvoices();
    });
    document.getElementById('tagihan-prev-page').addEventListener('click', () => {
        if (tagihanCurrentPage > 1) {
            tagihanCurrentPage--;
            renderInvoices();
        }
    });
    document.getElementById('tagihan-next-page').addEventListener('click', () => {
        tagihanCurrentPage++;
        renderInvoices();
    });

    // Export CSV
    document.getElementById('btn-export-pelanggan-csv').addEventListener('click', exportPelangganToCsv);
    document.getElementById('btn-export-tagihan-csv').addEventListener('click', exportTagihanToCsv);

    // Export PDF Laporan
    document.getElementById('btn-export-laporan-pdf').addEventListener('click', () => {
        const element = document.getElementById('laporan-export-area');
        const bulanEl = document.getElementById('laporan-filter-bulan');
        const tahunEl = document.getElementById('laporan-filter-tahun');
        const bulanOptions = bulanEl.options;
        const selectedBulanText = bulanOptions[bulanEl.selectedIndex].text;
        const selectedTahunValue = tahunEl.value;
        const filename = `Laporan Keuangan - ${selectedBulanText} ${selectedTahunValue}.pdf`;
        html2canvas(element, { scale: 2 }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(filename);
        });
    });

    // Filter Laporan
    document.getElementById('laporan-filter-bulan').addEventListener('change', renderLaporan);
    document.getElementById('laporan-filter-tahun').addEventListener('change', renderLaporan);

    // Event listener untuk tombol edit/hapus (delegasi event)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const id = btn.dataset.id;
        const customerId = btn.dataset.customerId; // Untuk tombol chat

        if (btn.classList.contains('btn-edit-pelanggan')) {
            const c = allCustomers.find(cust => cust.id === id);
            if (!c) return;
            document.getElementById('pelanggan-id').value = c.id;
            document.getElementById('id-pelanggan-display').value = c.customerId || 'N/A';
            document.getElementById('id-pelanggan-display').readOnly = true; // Nonaktifkan input ID saat edit
            document.getElementById('nama').value = c.nama;
            document.getElementById('alamat').value = c.alamat;
            document.getElementById('hp').value = c.hp;
            document.getElementById('join-date').value = c.joinDate;
            // Isi dropdown paket
            populatePaketSelect('paket-pelanggan', c.paketId);
            // Isi dropdown status (tambahkan ini)
            document.getElementById('status-pelanggan').value = c.status || 'Aktif'; // Pastikan dropdown status ada di form
            document.getElementById('modal-pelanggan-title').textContent = 'Edit Data Pelanggan';
            openModal(document.getElementById('modal-pelanggan'));
        } else if (btn.classList.contains('btn-delete-pelanggan')) {
            const row = document.getElementById(`customer-row-${id}`);
            if (!row) return;
            row.style.display = 'none';
            showUndoToast({
                message: "Pelanggan dihapus.",
                commit: () => deleteCustomer(id),
                undo: () => { row.style.display = ''; }
            });
        } else if (btn.classList.contains('btn-chat-pelanggan')) {
            if (customerId) {
                const customer = allCustomers.find(c => c.id === customerId);
                if (customer && customer.hp) {
                    const formattedPhone = formatPhoneNumber(customer.hp);
                    if (formattedPhone) {
                        window.open(`https://wa.me/${formattedPhone}`, '_blank');
                    } else {
                        showToast("Nomor HP tidak valid.", "error");
                    }
                } else {
                    showToast("Nomor HP pelanggan tidak ditemukan.", "error");
                }
            }
        } else if (btn.classList.contains('btn-edit-paket')) {
            const p = allPackages.find(pkg => pkg.id === id);
            if (!p) return;
            document.getElementById('paket-id').value = p.id;
            document.getElementById('nama-paket').value = p.nama;
            document.getElementById('kecepatan').value = p.kecepatan;
            document.getElementById('harga').value = p.harga;
            document.getElementById('harga-prorate').value = p.hargaProrate || '';
            document.getElementById('modal-paket-title').textContent = 'Edit Paket';
            openModal(document.getElementById('modal-paket'));
        } else if (btn.classList.contains('btn-delete-paket')) {
            const row = document.getElementById(`paket-row-${id}`);
            if (!row) return;
            row.style.display = 'none';
            showUndoToast({
                message: "Paket dihapus.",
                commit: () => deletePaket(id),
                undo: () => { row.style.display = ''; }
            });
        } else if (btn.classList.contains('btn-edit-tagihan')) {
            const inv = allInvoices.find(i => i.id === id);
            if (!inv) return;
            const customer = allCustomers.find(c => c.id === inv.pelangganId);
            document.getElementById('tagihan-id').value = inv.id;
            document.getElementById('tagihan-pelanggan').innerHTML = `<option value="${customer?.id || ''}" selected>${customer?.nama || 'N/A'}</option>`;
            document.getElementById('tagihan-periode').value = inv.periode || 'N/A';
            document.getElementById('tagihan-status').value = inv.status;
            document.getElementById('tagihan-jumlah').value = inv.jumlah;
            document.getElementById('modal-tagihan-title').textContent = 'Edit Tagihan';
            openModal(document.getElementById('modal-tagihan'));
        } else if (btn.classList.contains('btn-delete-tagihan')) {
            const row = document.getElementById(`invoice-row-${id}`);
            if (!row) return;
            row.style.display = 'none';
            showUndoToast({
                message: "Tagihan dihapus.",
                commit: () => deleteInvoice(id),
                undo: () => { row.style.display = ''; }
            });
        } else if (btn.classList.contains('btn-edit-pengeluaran')) {
            const exp = allExpenses.find(e => e.id === id);
            if (!exp) return;
            document.getElementById('pengeluaran-id').value = exp.id;
            document.getElementById('pengeluaran-tanggal').value = exp.tanggal;
            document.getElementById('pengeluaran-kategori').value = exp.kategori;
            document.getElementById('pengeluaran-deskripsi').value = exp.deskripsi;
            document.getElementById('pengeluaran-jumlah').value = exp.jumlah;
            document.getElementById('modal-pengeluaran-title').textContent = 'Edit Pengeluaran';
            openModal(document.getElementById('modal-pengeluaran'));
        } else if (btn.classList.contains('btn-delete-pengeluaran')) {
            const row = document.getElementById(`expense-row-${id}`);
            if (!row) return;
            row.style.display = 'none';
            showUndoToast({
                message: "Pengeluaran dihapus.",
                commit: () => deleteExpense(id),
                undo: () => { row.style.display = ''; }
            });
        } else if (btn.classList.contains('btn-edit-status-jaringan')) {
            const s = allNetworkStatus.find(st => st.id === id);
            if (!s) return;
            document.getElementById('status-jaringan-id').value = s.id;
            document.getElementById('status-jaringan-status').value = s.title; // Gunakan title
            document.getElementById('status-jaringan-deskripsi').value = s.description;
            document.getElementById('modal-status-jaringan-title').textContent = 'Edit Status Jaringan';
            openModal(document.getElementById('modal-status-jaringan'));
        } else if (btn.classList.contains('btn-delete-status-jaringan')) {
            const row = document.getElementById(`status-row-${id}`);
            if (!row) return;
            row.style.display = 'none';
            showUndoToast({
                message: "Status jaringan dihapus.",
                commit: () => deleteNetworkStatus(id),
                undo: () => { row.style.display = ''; }
            });
        } else if (btn.classList.contains('btn-edit-artikel')) {
            const p = allBlogPosts.find(post => post.id === id);
            if (!p) return;
            document.getElementById('artikel-id').value = p.id;
            document.getElementById('artikel-judul').value = p.title;
            document.getElementById('artikel-penulis').value = p.author;
            document.getElementById('artikel-konten').value = p.content;
            document.getElementById('modal-artikel-title').textContent = 'Edit Artikel';
            openModal(document.getElementById('modal-artikel'));
        } else if (btn.classList.contains('btn-delete-artikel')) {
            const row = document.getElementById(`blog-row-${id}`);
            if (!row) return;
            row.style.display = 'none';
            showUndoToast({
                message: "Artikel dihapus.",
                commit: () => deleteBlogPost(id),
                undo: () => { row.style.display = ''; }
            });
        }
    });
}


function showContent(targetId) {
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.classList.remove('tab-active');
    });

    const targetContent = document.getElementById(targetId);
    const targetTab = document.getElementById(targetId.replace('content-', 'tab-'));
    if (targetContent) targetContent.classList.remove('hidden');
    if (targetTab) targetTab.classList.add('tab-active');
}

function closeModal(modal) {
    modal.classList.add('hidden');
    const form = modal.querySelector('form');
    if (form) form.reset();
    modal.querySelectorAll('.error-message').forEach(el => el.textContent = '');
}

function openModal(modal) {
    modal.classList.remove('hidden');
}

function updatePaginationControls(type, currentPage, totalPages) {
    document.getElementById(`${type}-current-page`).textContent = currentPage;
    document.getElementById(`${type}-total-pages`).textContent = totalPages;
    document.getElementById(`${type}-prev-page`).disabled = currentPage === 1;
    document.getElementById(`${type}-next-page`).disabled = currentPage >= totalPages;
}

function populatePaketFilter() {
    const filterSelect = document.getElementById('pelanggan-paket-filter');
    filterSelect.innerHTML = '<option value="semua">Semua Paket</option>';
    allPackages.forEach(pkg => {
        const option = document.createElement('option');
        option.value = pkg.id;
        option.textContent = pkg.nama;
        filterSelect.appendChild(option);
    });
}

function populatePaketSelect(selectId, selectedValue = null) {
    const select = document.getElementById(selectId);
    select.innerHTML = '';
    allPackages.forEach(pkg => {
        const option = document.createElement('option');
        option.value = pkg.id;
        option.textContent = pkg.nama;
        if (selectedValue && pkg.id === selectedValue) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

// --- Fungsi CRUD lainnya (saveInvoice, deleteInvoice, saveExpense, deleteExpense, dll.) ---

// --- Invoice ---
async function saveInvoice(invoiceData) {
    try {
        if (invoiceData.id) {
            // Jika ID ada, lakukan update
            const invoiceRef = doc(db, dataContainerPath, 'invoices', invoiceData.id);
            // Gunakan data dari form tagihan untuk update status/jumlah
            await updateDoc(invoiceRef, {
                status: invoiceData.status, // Ambil dari form edit
                jumlah: Number(invoiceData.jumlah) // Ambil dari form edit
                // Jika Anda ingin mengizinkan edit periode juga:
                // periode: invoiceData.periode
            });
            showToast("Tagihan berhasil diperbarui.");
        } else {
            // Jika ID tidak ada, ini adalah fungsi untuk *menambah* tagihan manual (tidak umum, generate digunakan)
            // Kode ini bisa disesuaikan jika fitur tambah manual diperlukan
            // await addDoc(getCollectionRef('invoices'), invoiceData);
            // showToast("Tagihan baru berhasil ditambahkan.");
            showToast("Operasi tidak valid untuk menambah tagihan.", "error");
            return; // atau throw error
        }
        closeModal(document.getElementById('modal-tagihan'));
    } catch (error) {
        console.error("Error saving invoice:", error);
        showToast("Gagal menyimpan data tagihan.", "error");
    }
}

async function deleteInvoice(id) {
    try {
        await deleteDoc(doc(db, dataContainerPath, 'invoices', id));
        // Tidak perlu toast di sini karena akan ditangani oleh Undo Toast di event listener
    } catch (e) {
        console.error("Error deleting invoice:", e);
        showToast("Gagal menghapus tagihan.", "error");
    }
}

// --- Expense ---
async function saveExpense(expenseData) {
    try {
        const collectionRef = getCollectionRef('expenses');
        if (expenseData.id) {
            // Update pengeluaran
            await updateDoc(doc(collectionRef, expenseData.id), expenseData);
            showToast("Data pengeluaran berhasil diperbarui.");
        } else {
            // Tambah pengeluaran baru
            await addDoc(collectionRef, expenseData);
            showToast("Pengeluaran baru berhasil ditambahkan.");
        }
        closeModal(document.getElementById('modal-pengeluaran'));
    } catch (error) {
        console.error("Error saving expense:", error);
        showToast("Gagal menyimpan data pengeluaran.", "error");
    }
}

async function deleteExpense(id) {
    try {
        await deleteDoc(doc(db, dataContainerPath, 'expenses', id));
        // Tidak perlu toast di sini karena akan ditangani oleh Undo Toast di event listener
    } catch (e) {
        console.error("Error deleting expense:", e);
        showToast("Gagal menghapus pengeluaran.", "error");
    }
}

// --- Network Status ---
async function saveNetworkStatus(statusData) {
    try {
        const collectionRef = getCollectionRef('network_status');
        const dataToSave = {
            title: statusData.title,
            description: statusData.description,
            status: statusData.status,
            timestamp: serverTimestamp() // Gunakan serverTimestamp untuk konsistensi
        };
        if (statusData.id) {
            // Update status jaringan
            await updateDoc(doc(collectionRef, statusData.id), dataToSave);
            showToast("Status jaringan berhasil diperbarui.");
        } else {
            // Tambah status jaringan baru
            await addDoc(collectionRef, dataToSave);
            showToast("Status jaringan baru berhasil ditambahkan.");
        }
        closeModal(document.getElementById('modal-status-jaringan'));
    } catch (error) {
        console.error("Error saving network status:", error);
        showToast("Gagal menyimpan status jaringan.", "error");
    }
}

async function deleteNetworkStatus(id) {
    try {
        await deleteDoc(doc(db, dataContainerPath, 'network_status', id));
        // Tidak perlu toast di sini karena akan ditangani oleh Undo Toast di event listener
    } catch (e) {
        console.error("Error deleting network status:", e);
        showToast("Gagal menghapus status jaringan.", "error");
    }
}

// --- Blog Post ---
async function saveBlogPost(postData) {
    try {
        const collectionRef = getCollectionRef('articles');
        const dataToSave = {
            title: postData.title,
            author: postData.author, // Pastikan field ini digunakan
            content: postData.content,
            // createdAt akan diatur oleh serverTimestamp di bawah jika ini adalah artikel baru
        };

        if (postData.id) {
            // Update artikel
            // Jika ini update, kita mungkin ingin mempertahankan timestamp pembuatan asli
            // Tapi jika ingin update timestamp publikasi, gunakan serverTimestamp()
            await updateDoc(doc(collectionRef, postData.id), dataToSave);
            showToast("Artikel berhasil diperbarui.");
        } else {
            // Tambah artikel baru
            dataToSave.createdAt = serverTimestamp(); // Set timestamp baru jika ini adalah artikel baru
            await addDoc(collectionRef, dataToSave);
            showToast("Artikel baru berhasil ditambahkan.");
        }
        closeModal(document.getElementById('modal-artikel'));
    } catch (error) {
        console.error("Error saving blog post:", error);
        showToast("Gagal menyimpan artikel.", "error");
    }
}

async function deleteBlogPost(id) {
    try {
        await deleteDoc(doc(db, dataContainerPath, 'articles', id));
        // Tidak perlu toast di sini karena akan ditangani oleh Undo Toast di event listener
    } catch (e) {
        console.error("Error deleting blog post:", e);
        showToast("Gagal menghapus artikel.", "error");
    }
}

// --- Fungsi Generate Tagihan ---
async function generateInvoices(periode, useProrate = false) {
    showToast("Memulai proses generate tagihan...", "info");
    const batch = writeBatch(db);
    let generatedCount = 0;
    let skippedCount = 0;

    const [year, month] = periode.split('-');
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Akhir bulan
    const periodeString = endDate.toISOString().split('T')[0]; // Format YYYY-MM-DD

    for (const customer of allCustomers) {
        // Cek apakah sudah ada tagihan untuk periode ini
        const existingInvoice = allInvoices.find(inv => inv.pelangganId === customer.id && inv.periode === periodeString);
        if (existingInvoice) {
            skippedCount++;
            continue;
        }

        // Hanya generate tagihan untuk pelanggan Aktif
        if (customer.status !== 'Aktif') {
            skippedCount++;
            continue;
        }

        const pkg = allPackages.find(p => p.id === customer.paketId);
        if (!pkg) {
            console.warn(`Paket tidak ditemukan untuk pelanggan ${customer.id}`);
            skippedCount++;
            continue;
        }

        let jumlahTagihan = pkg.harga;

        if (useProrate && customer.joinDate) {
            const joinDate = new Date(customer.joinDate);
            // Jika pelanggan join di bulan yang sama dengan periode generate
            if (joinDate.getFullYear() === parseInt(year) && joinDate.getMonth() === parseInt(month) - 1) {
                const daysInMonth = new Date(year, month, 0).getDate();
                const joinDay = joinDate.getDate();
                const daysUsed = daysInMonth - joinDay + 1;
                jumlahTagihan = Math.round((pkg.harga / daysInMonth) * daysUsed);
            }
        }

        const newInvoice = {
            pelangganId: customer.id,
            jumlah: jumlahTagihan,
            periode: periodeString,
            status: 'belum lunas',
            createdAt: serverTimestamp(),
            isProrated: useProrate && customer.joinDate && new Date(customer.joinDate).getFullYear() === parseInt(year) && new Date(customer.joinDate).getMonth() === parseInt(month) - 1
        };

        // Gunakan addDoc untuk batch
        await addDoc(getCollectionRef('invoices'), newInvoice);
        generatedCount++;
    }

    // Karena addDoc digunakan, batch mungkin tidak diperlukan jika jumlahnya besar,
    // tetapi untuk konsistensi atau jika ingin menggabungkan operasi lain, bisa tetap digunakan.
    // await batch.commit(); // Hapus jika menggunakan addDoc di dalam loop

    showToast(generatedCount > 0 ? `${generatedCount} tagihan baru digenerate.` : "Tidak ada tagihan baru.", "info");
    if (skippedCount > 0) {
        showToast(`${skippedCount} pelanggan dilewati (sudah ada tagihan atau status tidak Aktif).`, 'info');
    }
}

// --- Fungsi Export CSV ---
// Fungsi umum untuk membuat file CSV
function exportToCsv(rows, filename) {
    if (rows.length === 0) {
        showToast("Tidak ada data untuk di-export.", "error");
        return;
    }
    showToast("Mempersiapkan CSV...", "info");
    const replacer = (key, value) => value === null ? '' : value;
    const header = Object.keys(rows[0]);
    const csv = [
        header.join(','),
        ...rows.map(row => header.map(fieldName => JSON.stringify(row[fieldName], replacer)).join(','))
    ].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Export data pelanggan
function exportPelangganToCsv() {
    let filteredCustomers = [...allCustomers];

    // Terapkan filter pencarian dan paket jika diperlukan
    if (customerSearchTerm) {
        const lower = customerSearchTerm.toLowerCase();
        filteredCustomers = filteredCustomers.filter(c =>
            c.nama.toLowerCase().includes(lower) || (c.customerId && c.customerId.includes(lower))
        );
    }
    if (customerPackageFilter !== 'semua') {
        filteredCustomers = filteredCustomers.filter(c => c.paketId === customerPackageFilter);
    }
    // Tambahkan filter status pelanggan jika diperlukan
    if (customerStatusFilter !== 'semua') {
        filteredCustomers = filteredCustomers.filter(c => c.status === customerStatusFilter);
    }

    const dataToExport = filteredCustomers.map(c => {
        const pkg = allPackages.find(p => p.id === c.paketId) || { nama: 'N/A', harga: 0 };
        return {
            'ID Pelanggan': c.customerId || 'N/A',
            'Nama': c.nama,
            'Alamat': c.alamat,
            'No HP': c.hp,
            'Paket': pkg.nama,
            'Harga Paket': pkg.harga,
            'Status': c.status, // Tambahkan kolom status
            'Tgl Bergabung': c.joinDate || 'N/A'
        };
    });

    exportToCsv(dataToExport, 'jaganetwork_pelanggan.csv');
}

// Export data tagihan
function exportTagihanToCsv() {
    let filteredInvoices = [...allInvoices];

    // Terapkan filter pencarian dan status jika diperlukan
    if (invoiceSearchTerm) {
        const lower = invoiceSearchTerm.toLowerCase();
        filteredInvoices = filteredInvoices.filter(inv => {
            const customer = allCustomers.find(c => c.id === inv.pelangganId);
            return (customer && customer.nama.toLowerCase().includes(lower)) || getBillingPeriodText(inv, customer).toLowerCase().includes(lower);
        });
    }
    if (invoiceStatusFilter !== 'semua') {
        filteredInvoices = filteredInvoices.filter(inv => inv.status === invoiceStatusFilter);
    }

    const dataToExport = filteredInvoices.map(inv => {
        const customer = allCustomers.find(c => c.id === inv.pelangganId) || { nama: 'Terhapus' };
        return {
            'Nama Pelanggan': customer.nama,
            'Periode Layanan': getBillingPeriodText(inv, customer), // Pastikan fungsi ini tersedia
            'Jumlah (Rp)': inv.jumlah,
            'Status': inv.status,
            'Tipe Tagihan': inv.isProrated ? 'Prorata' : 'Bulanan'
        };
    });

    exportToCsv(dataToExport, 'jaganetwork_tagihan.csv');
}

// Fungsi bantu untuk format periode tagihan (pastikan fungsi ini didefinisikan)
// Contoh sederhana, sesuaikan dengan format sebenarnya dari kode Anda
function getBillingPeriodText(inv, customer) {
    // Contoh: "Jan 2025" atau "1 Jan 2025 - 31 Jan 2025"
    // Kode Anda sebelumnya menggunakan inv.periode (format YYYY-MM-DD)
    // dan mungkin menghitung tanggal berdasarkan joinDate customer jika prorate
    // Implementasi detail tergantung logika Anda, ini hanya contoh dasar:
    if (!inv.periode) return 'N/A';
    const date = new Date(inv.periode);
    return date.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
    // Jika Anda memiliki logika kompleks untuk menampilkan rentang tanggal, gunakan fungsi tersebut di sini.
}

// --- Fungsi Load Calendar Events (untuk widget agenda mendatang di dashboard) ---
// Sudah didefinisikan sebelumnya di file Anda:
// function loadCalendarEventsForWidget() { ... }
// function renderUpcomingEventsWidget(allRawEvents) { ... }

// --- Fungsi Analytics dan Chart ---
// Sudah didefinisikan sebelumnya di file Anda:
// function calculateAnalytics(data) { ... }
// function prepareChartData(data) { ... }
// function renderAnalyticsCharts(chartData) { ... }
// function initAnalytics() { ... }

// Variabel global untuk menyimpan instance chart tambahan di analytics
// Sudah didefinisikan di awal file Anda:
// let analyticsCharts = {};

// Fungsi untuk menghitung metrik analytics
// function calculateAnalytics(data) {
//     const { customers, packages, invoices, expenses } = data;
//     const today = new Date();
//     const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
//     const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

//     // --- KPI Dashboard ---
//     // Gunakan pengecekan null sebelum mengakses elemen
//     const kpiTotalCustomersEl = document.getElementById('kpi-total-customers');
//     if (kpiTotalCustomersEl) kpiTotalCustomersEl.textContent = customers.length;

//     // Tagihan Bulan Ini (Total Jumlah Tagihan)
//     const invoicesThisMonth = invoices.filter(inv => {
//         if (!inv.periode) return false;
//         const invDate = new Date(inv.periode);
//         return invDate >= thisMonthStart && invDate <= thisMonthEnd;
//     });
//     const totalInvoicesThisMonth = invoicesThisMonth.reduce((sum, inv) => sum + inv.jumlah, 0);
//     const kpiCurrentMonthInvoicesEl = document.getElementById('kpi-current-month-invoices');
//     if (kpiCurrentMonthInvoicesEl) kpiCurrentMonthInvoicesEl.textContent = formatRupiah(totalInvoicesThisMonth);

//     // Pendapatan Bulan Ini (Jumlah Tagihan yang Lunas)
//     const revenueThisMonth = invoicesThisMonth.filter(inv => inv.status === 'lunas').reduce((sum, inv) => sum + inv.jumlah, 0);
//     const kpiCurrentMonthRevenueEl = document.getElementById('kpi-current-month-revenue');
//     if (kpiCurrentMonthRevenueEl) kpiCurrentMonthRevenueEl.textContent = formatRupiah(revenueThisMonth);

//     // Tagihan Belum Lunas
//     const pendingInvoices = invoices.filter(inv => inv.status === 'belum lunas').length;
//     const kpiPendingInvoicesEl = document.getElementById('kpi-pending-invoices');
//     if (kpiPendingInvoicesEl) kpiPendingInvoicesEl.textContent = pendingInvoices;

//     // --- KPI Analytics ---
//     // Pelanggan Baru Bulan Ini
//     const newCustomersThisMonth = customers.filter(c => {
//         if (!c.joinDate) return false;
//         const joinDate = new Date(c.joinDate);
//         return joinDate >= thisMonthStart && joinDate <= thisMonthEnd;
//     }).length;
//     const kpiNewCustomersEl = document.getElementById('kpi-new-customers');
//     if (kpiNewCustomersEl) kpiNewCustomersEl.textContent = newCustomersThisMonth;

//     // Pengeluaran Bulan Ini
//     const expensesThisMonth = expenses.filter(exp => {
//         if (!exp.tanggal) return false;
//         const expDate = new Date(exp.tanggal);
//         return expDate >= thisMonthStart && expDate <= thisMonthEnd;
//     });
//     const totalExpensesThisMonth = expensesThisMonth.reduce((sum, exp) => sum + exp.jumlah, 0);
//     const totalPengeluaranEl = document.getElementById('total-pengeluaran-dashboard');
//     if (totalPengeluaranEl) totalPengeluaranEl.textContent = formatRupiah(totalExpensesThisMonth);

//     // Pengeluaran Terbesar
//     const expensesByCategory = {};
//     expenses.forEach(e => {
//         expensesByCategory[e.kategori] = (expensesByCategory[e.kategori] || 0) + e.jumlah;
//     });
//     if (Object.keys(expensesByCategory).length > 0) {
//         const [topCategory] = Object.entries(expensesByCategory).sort(([,a], [,b]) => b - a)[0];
//         const kpiTopExpenseCategoryEl = document.getElementById('kpi-top-expense-category');
//         if (kpiTopExpenseCategoryEl) kpiTopExpenseCategoryEl.textContent = topCategory;
//     } else {
//         const kpiTopExpenseCategoryEl = document.getElementById('kpi-top-expense-category');
//         if (kpiTopExpenseCategoryEl) kpiTopExpenseCategoryEl.textContent = '-';
//     }
// }

// Fungsi untuk menyiapkan data yang akan digunakan oleh Chart.js
// function prepareChartData(data) {
//     const { customers, packages, invoices, expenses } = data;

//     // Inisialisasi objek history untuk 12 bulan terakhir
//     const history = {};
//     for (let i = 11; i >= 0; i--) {
//         const d = new Date();
//         d.setMonth(d.getMonth() - i);
//         const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; // Format: YYYY-MM
//         history[monthKey] = {
//             revenue: 0,
//             profit: 0, // Pendapatan - Pengeluaran
//             customers: 0,
//             expenses: 0
//         };
//     }

//     // Hitung pendapatan dan pelanggan per bulan
//     invoices.forEach(inv => {
//         if (!inv.periode || inv.status !== 'lunas') return; // Hanya tagihan lunas yang dihitung
//         const d = new Date(inv.periode);
//         const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
//         if (history[monthKey]) {
//             history[monthKey].revenue += inv.jumlah;
//         }
//     });

//     // Hitung pengeluaran per bulan
//     expenses.forEach(e => {
//         if (!e.tanggal) return;
//         const d = new Date(e.tanggal);
//         const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
//         if (history[monthKey]) {
//             history[monthKey].expenses += e.jumlah;
//         }
//     });

//     // Hitung jumlah pelanggan per bulan (jumlah pelanggan di akhir bulan)
//     const allJoinDates = [...customers].sort((a, b) => new Date(a.joinDate) - new Date(b.joinDate)).map(c => new Date(c.joinDate));
//     Object.keys(history).forEach(monthKey => {
//         const [year, month] = monthKey.split('-').map(Number);
//         const endOfMonth = new Date(year, month, 0); // Akhir bulan
//         const activeCustomersCount = allJoinDates.filter(joinDate => joinDate <= endOfMonth).length;
//         history[monthKey].customers = activeCustomersCount;
//         history[monthKey].profit = history[monthKey].revenue - history[monthKey].expenses;
//     });

//     // Hitung pendapatan per paket
//     const revenueByPackage = {};
//     invoices.filter(inv => inv.status === 'lunas').forEach(inv => {
//         const customer = customers.find(c => c.id === inv.pelangganId);
//         if (customer) {
//             const pkg = packages.find(p => p.id === customer.paketId);
//             if (pkg) {
//                 revenueByPackage[pkg.nama] = (revenueByPackage[pkg.nama] || 0) + inv.jumlah;
//             }
//         }
//     });

//     // Hitung pengeluaran per kategori
//     const expensesByCategory = {};
//     expenses.forEach(e => {
//         expensesByCategory[e.kategori] = (expensesByCategory[e.kategori] || 0) + e.jumlah;
//     });

//     return { history, revenueByPackage, expensesByCategory };
// }

// Fungsi untuk menginisialisasi dan merender chart di tab Analytics
// function renderAnalyticsCharts(chartData) {
//     // Hancurkan instance chart sebelumnya untuk mencegah memory leak
//     Object.values(analyticsCharts).forEach(chart => {
//         if (chart) chart.destroy();
//     });

//     const { history, revenueByPackage, expensesByCategory } = chartData;
//     const colorPalette = ['#4f46e5', '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#d946ef'];

//     const labels = Object.keys(history).map(k => new Date(k + '-02').toLocaleString('id-ID', { month: 'short', year: 'numeric' }));
//     const profitData = Object.values(history).map(h => h.profit);
//     const revenueData = Object.values(history).map(h => h.revenue);

//     // Gabungkan data profit dan revenue untuk menghitung padding skala Y
//     const allDataPoints = [...profitData, ...revenueData];
//     const dataMax = Math.max(0, ...allDataPoints);
//     const dataMin = Math.min(0, ...allDataPoints);
//     const padding = (dataMax - dataMin) * 0.1;
//     const calculatedMax = dataMax + padding;
//     const calculatedMin = dataMin - padding;

//     // Chart 1: Pendapatan vs Laba Kotor
//     analyticsCharts.revenueProfit = new Chart(document.getElementById('revenue-profit-chart').getContext('2d'), {
//         type: 'bar',
//          {
//             labels: labels,
//             datasets: [
//                 {
//                     label: 'Pendapatan',
//                      revenueData,
//                     backgroundColor: '#3b82f6'
//                 },
//                 {
//                     label: 'Laba Kotor',
//                      profitData,
//                     backgroundColor: '#10b981'
//                 }
//             ]
//         },
//         options: {
//             responsive: true,
//             maintainAspectRatio: false,
//             scales: {
//                 x: { stacked: false },
//                 y: {
//                     stacked: false,
//                     min: calculatedMin,
//                     max: calculatedMax
//                 }
//             }
//         }
//     });

//     // Chart 2: Komposisi Pendapatan per Paket
//     analyticsCharts.revenueComp = new Chart(document.getElementById('revenue-composition-chart').getContext('2d'), {
//         type: 'doughnut',
//          {
//             labels: Object.keys(revenueByPackage),
//             datasets: [{
//                 label: 'Pendapatan',
//                  Object.values(revenueByPackage),
//                 backgroundColor: colorPalette
//             }]
//         },
//         options: {
//             responsive: true,
//             maintainAspectRatio: false
//         }
//     });

//     // Chart 3: Pertumbuhan Jumlah Pelanggan
//     analyticsCharts.customerGrowth = new Chart(document.getElementById('customer-growth-chart').getContext('2d'), {
//         type: 'line',
//         data: {
//             labels: labels,
//             datasets: [{
//                 label: 'Total Pelanggan',
//                  Object.values(history).map(h => h.customers),
//                 borderColor: '#4f46e5',
//                 backgroundColor: 'rgba(79, 70, 229, 0.1)',
//                 fill: true,
//                 tension: 0.3
//             }]
//         },
//         options: {
//             responsive: true,
//             maintainAspectRatio: false,
//             scales: {
//                 y: { beginAtZero: true }
//             }
//         }
//     });

//     // Chart 4: Komposisi Pengeluaran per Kategori
//     analyticsCharts.expensesComp = new Chart(document.getElementById('expenses-composition-chart').getContext('2d'), {
//         type: 'pie',
//          {
//             labels: Object.keys(expensesByCategory),
//             datasets: [{
//                 label: 'Pengeluaran',
//                  Object.values(expensesByCategory),
//                 backgroundColor: colorPalette.reverse() // Balikkan warna agar berbeda
//             }]
//         },
//         options: {
//             responsive: true,
//             maintainAspectRatio: false
//         }
//     });
// }

// Fungsi untuk menginisialisasi tab Analytics saat pertama kali dibuka
// function initAnalytics() {
//     const data = { customers: allCustomers, packages: allPackages, invoices: allInvoices, expenses: allExpenses };

//     // Jika data belum dimuat, tampilkan loading
//     if (data.customers.length === 0 && data.packages.length === 0) {
//         document.getElementById('loading-indicator-analytics').style.display = 'block';
//         document.getElementById('analytics-content-container').style.display = 'none';
//         return;
//     }

//     // Sembunyikan loading, tampilkan konten
//     document.getElementById('loading-indicator-analytics').style.display = 'none';
//     document.getElementById('analytics-content-container').style.display = 'block';

//     // Update tanggal di header analytics
//     document.getElementById('current-date-analytics').textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

//     // Hitung analytics dan render chart
//     calculateAnalytics(data);
//     renderAnalyticsCharts(prepareChartData(data));
//     analyticsInitialized = true; // Tandai bahwa analytics telah diinisialisasi
// }

// Fungsi Load Calendar Events (untuk widget agenda mendatang di dashboard)
// function loadCalendarEventsForWidget() { // Nama fungsi diubah agar lebih spesifik
//     const q = query(getCollectionRef('calendar_events')); // Asumsi koleksi disimpan di dataContainerPath

//     // Unsubscribe dari listener sebelumnya jika ada
//     if (unsubscribeCalendarEvents) unsubscribeCalendarEvents();

//     unsubscribeCalendarEvents = onSnapshot(q, (snapshot) => {
//         // Ambil semua data acara dari Firestore
//         const allRawEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//         // Perbarui widget agenda mendatang dengan data baru
//         renderUpcomingEventsWidget(allRawEvents);
//     });
// }

// Fungsi untuk merender widget agenda mendatang di dashboard
// function renderUpcomingEventsWidget(allRawEvents) {
//     const listEl = document.getElementById('upcoming-events-widget');
//     if (!listEl) return; // Jika elemen tidak ditemukan, hentikan fungsi

//     const now = new Date();
//     now.setHours(0, 0, 0, 0); // Set waktu ke awal hari (00:00:00) untuk perbandingan yang akurat

//     // Filter acara yang mulai dalam 7 hari ke depan (termasuk hari ini)
//     const sevenDaysFromNow = new Date(now);
//     sevenDaysFromNow.setDate(now.getDate() + 7);
//     const upcomingEvents = allRawEvents.filter(event => {
//         if (!event.start) return false; // Abaikan acara tanpa tanggal mulai
//         const startDate = new Date(event.start + 'T00:00:00'); // Format tanggal dari Firestore (YYYY-MM-DD)
//         return startDate >= now && startDate <= sevenDaysFromNow;
//     }).sort((a, b) => new Date(a.start) - new Date(b.start)); // Urutkan berdasarkan tanggal mulai

//     if (upcomingEvents.length === 0) {
//         listEl.innerHTML = `<p class="text-gray-500 text-center text-sm py-4">Tidak ada agenda.</p>`;
//         return;
//     }

//     // Render acara ke dalam elemen HTML
//     listEl.innerHTML = upcomingEvents.map(event => {
//         const startDate = new Date(event.start + 'T00:00:00');
//         const dayName = startDate.toLocaleDateString('id-ID', { weekday: 'short' }); // Misal: "Sen"
//         const dateFormatted = startDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); // Misal: "1 Jan"
//         // Gunakan warna berdasarkan kategori acara, atau warna default
//         const color = categoryColors[event.category] || categoryColors['umum'];

//         return `
//         <div class="flex items-start gap-3 text-sm">
//             <div class="border-l-4 rounded pl-3 py-1 flex-grow" style="border-color: ${color};">
//                 <p class="font-semibold text-gray-800">${event.title}</p>
//                 <p class="text-xs text-gray-600">${dayName}, ${dateFormatted}</p>
//             </div>
//         </div>
//         `;
//     }).join('');
// }

