const firebaseConfig = {
    apiKey: "AIzaSyCiVxQg8O1eKXbYkh9TO_WPJUkeMSlxHIY",
    authDomain: "sistema-de-flujo-de-dinero.firebaseapp.com",
    projectId: "sistema-de-flujo-de-dinero",
    storageBucket: "sistema-de-flujo-de-dinero.firebasestorage.app",
    messagingSenderId: "679067362300",
    appId: "1:679067362300:web:12836f12b3f236b2090879",
    measurementId: "G-LKPYELGEGB"
};
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';

// Inicializar Firebase Auth
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Variables Globales
let transactions = [];
let myChart = null;
let catChart = null;
let currentUser = null; // Guardará el ID del usuario actual

// Elementos del DOM actualizados
const elements = {
    // Vistas
    loginView: document.getElementById('login-view'),
    appContent: document.getElementById('app-content'),
    views: document.querySelectorAll('.view-section'),
    
    // Auth
    loginBtn: document.getElementById('main-login-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    userName: document.getElementById('user-name'),
    userAvatar: document.getElementById('user-avatar'),
    
    // Navegación
    navLinks: document.querySelectorAll('.nav-links li'),
    pageTitle: document.getElementById('page-title'),
    
    // UI Global
    dateDisplay: document.getElementById('current-date'),
    themeToggle: document.getElementById('theme-toggle'),
    
    // Tarjetas Resumen
    totalBalance: document.getElementById('total-balance'),
    totalIncome: document.getElementById('total-income'),
    totalExpense: document.getElementById('total-expense'),
    
    // Modal
    addBtn: document.getElementById('add-transaction-btn'),
    modal: document.getElementById('transaction-modal'),
    closeModalBtn: document.getElementById('close-modal'),
    form: document.getElementById('transaction-form'),
    
    // Listas
    recentList: document.getElementById('recent-transactions-list'),
    allList: document.getElementById('all-transactions-list'),
    viewAllBtn: document.getElementById('view-all-btn'),
    
    // Filtros
    searchInput: document.getElementById('search-input'),
    filterType: document.getElementById('filter-type'),
    filterMonth: document.getElementById('filter-month'),
};

const currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0
});

// Registrar eventos globales de autenticación ANTES del estado
elements.loginBtn.onclick = () => {
    elements.loginBtn.innerText = "Cargando...";
    signInWithPopup(auth, provider).catch(err => {
        alert("Error al entrar: " + err.message);
        elements.loginBtn.innerHTML = '<img src="https://www.google.com/favicon.ico" alt="Google" width="20"> Iniciar Sesión con Google';
    });
};
elements.logoutBtn.onclick = () => signOut(auth);

// Inicialización de Auth
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Usuario Logueado
        currentUser = user.uid;
        elements.loginView.style.display = 'none';
        elements.appContent.style.display = 'flex';
        
        // Mostrar perfil web y el botón de cerrar sesión
        document.getElementById('user-info').style.display = 'flex';
        
        elements.userName.textContent = user.displayName.split(' ')[0]; // Solo el primer nombre
        elements.userAvatar.src = user.photoURL;
        
        initDashboard();
    } else {
        // No hay usuario
        currentUser = null;
        elements.loginView.style.display = 'flex';
        elements.appContent.style.display = 'none';
        document.getElementById('user-info').style.display = 'none';
        
        elements.loginBtn.innerHTML = '<img src="https://img.icons8.com/color/48/000000/google-logo.png" alt="Google" width="24" style="margin-right:8px;"> Iniciar Sesión con Google';
        
        // Limpiar contenido previo para que no se traspase a otra cuenta
        transactions = [];
        elements.recentList.innerHTML = '';
        elements.allList.innerHTML = '';
        if(myChart) myChart.destroy();
        if(catChart) catChart.destroy();
    }
});

// Inicialización del Dashboard (solo cuando hay usuario)
function initDashboard() {
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    elements.dateDisplay.textContent = today.toLocaleDateString('es-ES', options);
    
    setupEventListeners();
    loadTransactions(); // Carga desde Python
}

function setupEventListeners() {
    // Navegación
    elements.navLinks.forEach(link => {
        link.onclick = () => {
            const target = link.getAttribute('data-target');
            elements.navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            elements.views.forEach(v => v.style.display = 'none');
            document.getElementById(`${target}-view`).style.display = 'block';
            
            // Re-render chart if going to dashboard
            if (target === 'dashboard' && transactions.length > 0) {
                updateCharts();
            }
        };
    });
    
    elements.viewAllBtn.onclick = () => document.querySelector('[data-target="transactions"]').click();

    elements.addBtn.onclick = () => {
        elements.modal.classList.add('active');
        document.getElementById('date').valueAsDate = new Date();
    };
    elements.closeModalBtn.onclick = () => {
        elements.modal.classList.remove('active');
        elements.form.reset();
    };
    
    // Formulrio - Enviar
    elements.form.onsubmit = handleFormSubmit;
    
    // Filtros
    elements.searchInput.oninput = renderAllTransactions;
    elements.filterType.onchange = renderAllTransactions;
    elements.filterMonth.onchange = renderAllTransactions;
    
    elements.themeToggle.onchange = (e) => {
        if (!e.target.checked) document.body.classList.add('light-theme');
        else document.body.classList.remove('light-theme');
        updateCharts();
    };
}

async function handleFormSubmit(e) {
    e.preventDefault();
    if (!currentUser) return;

    // Cambiar botón a cargando
    const submitBtn = elements.form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerText;
    submitBtn.innerText = "Guardando...";
    submitBtn.disabled = true;
    
    const newTransaction = {
        userId: currentUser,
        type: document.querySelector('input[name="type"]:checked').value,
        amount: parseFloat(document.getElementById('amount').value),
        description: document.getElementById('description').value,
        category: document.getElementById('category').value,
        date: document.getElementById('date').value
    };
    
    try {
        // Llama a nuestro servidor de Python
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTransaction)
        });
        
        if (response.ok) {
            elements.modal.classList.remove('active');
            elements.form.reset();
            // Actualizar tabla recargando desde Python
            loadTransactions();
        } else {
            const errorData = await response.json();
            console.error(errorData);
            alert("Error del servidor: " + (errorData.error || "Desconocido") + "\n" + (errorData.details || ""));
        }
    } catch(err) {
        console.error("Error de conexión:", err);
        alert("Error de conexión con el servidor Python");
    } finally {
        submitBtn.innerText = originalText;
        submitBtn.disabled = false;
    }
}

async function loadTransactions() {
    if (!currentUser) return;
    
    try {
        // Petición GET a Python con el ID del usuario y un timestamp para evitar cache web
        const response = await fetch(`/api/transactions?userId=${currentUser}&_=${new Date().getTime()}`);
        if (response.ok) {
            transactions = await response.json();
            populateMonthFilter();
            processTransactions();
        } else {
            console.error("Error obteniendo datos", await response.text());
        }
    } catch(err) {
        console.error("Error de conexión con la API Python:", err);
    }
}

function processTransactions() {
    updateDashboardSummary();
    renderRecentTransactions();
    renderAllTransactions();
    updateCharts();
}

function updateDashboardSummary() {
    const income = transactions.filter(t => t.type === 'income').reduce((acc, curr) => acc + curr.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0);
    const balance = income - expense;
    
    elements.totalIncome.textContent = currencyFormatter.format(income);
    elements.totalExpense.textContent = currencyFormatter.format(expense);
    elements.totalBalance.textContent = currencyFormatter.format(balance);
}

function renderRecentTransactions() {
    elements.recentList.innerHTML = '';
    
    if (transactions.length === 0) {
        elements.recentList.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-receipt"></i>
                <p>No hay transacciones aún.</p>
            </div>`;
        return;
    }
    
    const recent = transactions.slice(0, 5);
    
    recent.forEach(t => {
        const isIncome = t.type === 'income';
        const icon = getCategoryIcon(t.category);
        
        const item = document.createElement('div');
        item.className = 'transaction-item';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '16px';
        item.style.borderBottom = '1px solid var(--glass-border)';
        
        item.innerHTML = `
            <div style="display:flex; align-items:center; gap:16px;">
                <div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;color:var(--primary-color)">
                    <i class="fa-solid ${icon}"></i>
                </div>
                <div>
                    <h4 style="margin:0;font-size:1rem;">${t.description}</h4>
                    <span style="font-size:0.8rem;color:var(--text-muted)">${new Date(t.date).toLocaleDateString('es-ES')} • ${t.category}</span>
                </div>
            </div>
            <div style="text-align:right;">
                <h4 style="margin:0;color: ${isIncome ? 'var(--success-color)' : 'var(--text-main)'}">
                    ${isIncome ? '+' : '-'}${currencyFormatter.format(t.amount)}
                </h4>
            </div>
        `;
        elements.recentList.appendChild(item);
    });
}

function renderAllTransactions() {
    const searchTerm = elements.searchInput.value.toLowerCase();
    const filterType = elements.filterType.value;
    const filterMonth = elements.filterMonth.value;
    
    let filtered = transactions.filter(t => {
        const matchSearch = t.description.toLowerCase().includes(searchTerm) || t.category.toLowerCase().includes(searchTerm);
        const matchType = filterType === 'all' || t.type === filterType;
        const matchMonth = filterMonth === 'all' || t.date.startsWith(filterMonth);
        return matchSearch && matchType && matchMonth;
    });
    
    elements.allList.innerHTML = '';
    
    if (filtered.length === 0) {
        elements.allList.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;">No se encontraron resultados</td></tr>`;
        return;
    }
    
    filtered.forEach(t => {
        const isIncome = t.type === 'income';
        elements.allList.innerHTML += `
            <tr>
                <td>${new Date(t.date).toLocaleDateString('es-ES')}</td>
                <td style="font-weight:600;">${t.description}</td>
                <td><span class="type-badge" style="background:rgba(255,255,255,0.1)">${t.category}</span></td>
                <td style="color:${isIncome ? 'var(--success-color)' : 'var(--text-main)'}; font-weight:600;">
                    ${isIncome ? '+' : '-'}${currencyFormatter.format(t.amount)}
                </td>
                <td>
                    <button class="btn-icon" onclick="deleteTransaction('${t.id}')" title="Eliminar"><i class="fa-solid fa-trash" style="font-size:0.9rem; color: var(--danger-color)"></i></button>
                </td>
            </tr>
        `;
    });
}

// Función global para eliminar transacciones desde la tabla HTML dinámica
window.deleteTransaction = async function(transactionId) {
    if (!currentUser || !confirm("¿Seguro que deseas eliminar esta transacción? Esta acción no se puede deshacer.")) return;
    
    try {
        const response = await fetch(`/api/transactions/${transactionId}?userId=${currentUser}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            // Recargar datos desde Python
            loadTransactions();
        } else {
            console.error("Error al eliminar", await response.text());
            alert("No se pudo eliminar la transacción.");
        }
    } catch(err) {
        console.error("Error falló la conexión para borrar:", err);
    }
};

function updateCharts() {
    if (transactions.length === 0) return;
    
    const textColor = document.body.classList.contains('light-theme') ? '#64748b' : '#94a3b8';
    Chart.defaults.color = textColor;
    Chart.defaults.font.family = "'Inter', sans-serif";

    // Preparar Datos para Gráfico Principal (Últimos 7 días activos o agrupado por mes, aquí agruparemos por tipo para simplicidad)
    const incomesByCat = {};
    const expensesByCat = {};
    
    transactions.forEach(t => {
        if (t.type === 'expense') {
            expensesByCat[t.category] = (expensesByCat[t.category] || 0) + t.amount;
        } else {
            incomesByCat[t.category] = (incomesByCat[t.category] || 0) + t.amount;
        }
    });

    // Chart de Categorías (Gastos)
    const catLabels = Object.keys(expensesByCat);
    const catData = Object.values(expensesByCat);
    
    const ctxCat = document.getElementById('categoryChart').getContext('2d');
    if (catChart) catChart.destroy();
    
    catChart = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
            labels: catLabels.length ? catLabels : ['Sin Datos'],
            datasets: [{
                data: catData.length ? catData : [1],
                backgroundColor: catData.length ? [
                    '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#10b981'
                ] : ['rgba(255,255,255,0.1)'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' }
            }
        }
    });

    // Chart Principal (Ingresos vs Gastos barras simples)
    const ctxMain = document.getElementById('mainChart').getContext('2d');
    if (myChart) myChart.destroy();
    
    const totalInc = transactions.filter(t => t.type==='income').reduce((s,t)=>s+t.amount,0);
    const totalExp = transactions.filter(t => t.type==='expense').reduce((s,t)=>s+t.amount,0);

    myChart = new Chart(ctxMain, {
        type: 'bar',
        data: {
            labels: ['Resumen Global'],
            datasets: [
                {
                    label: 'Ingresos',
                    data: [totalInc],
                    backgroundColor: '#10b981',
                    borderRadius: 4
                },
                {
                    label: 'Gastos',
                    data: [totalExp],
                    backgroundColor: '#ef4444',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function getCategoryIcon(category) {
    const icons = {
        'Alimentación': 'fa-utensils',
        'Transporte': 'fa-car',
        'Vivienda': 'fa-house',
        'Entretenimiento': 'fa-film',
        'Salud': 'fa-notes-medical',
        'Salario': 'fa-money-bill-wave',
        'Inversiones': 'fa-chart-line',
        'Otros': 'fa-circle-question'
    };
    return icons[category] || 'fa-tag';
}

function populateMonthFilter() {
    const months = new Set();
    transactions.forEach(t => {
        if(t.date) {
            const yyyymm = t.date.substring(0, 7); // YYYY-MM
            months.add(yyyymm);
        }
    });
    
    const filter = elements.filterMonth;
    filter.innerHTML = '<option value="all">Este Mes / Todos</option>'; // Clean old options
    
    // Si no hay datos, agregar el mes actual
    if (months.size === 0) {
        const now = new Date();
        const yyyymm = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        months.add(yyyymm);
    }

    [...months].sort().reverse().forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        // Formatear visualmente (ej. "2023-10" a "Octubre 2023")
        const [year, month] = m.split('-');
        if(year && month) {
            const dateObj = new Date(year, month - 1);
            const name = dateObj.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
            opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
            filter.appendChild(opt);
        }
    });
}

// La app se inicia automáticamente cuando onAuthStateChanged se dispara (línea 76)
