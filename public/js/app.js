document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});

const LOCALE = 'es-AR';
let rawData = []; // Store full dataset
let currentGranularity = 'day';

// State for filters
const activeFilters = {
    date: new Date().toISOString().slice(0, 7), // YYYY-MM
    line: 'all',
    sku: '',
    familia: 'all',
    molde: 'all'
};

let chartCurveInstance = null;
let chartBarInstance = null;

async function initDashboard() {
    // Set initial date filter in UI
    document.getElementById('filter-date').value = activeFilters.date;

    // 1. Fetch Data (All data or constrained by date range if possible, but for UX we fetch all active period)
    const { data, error } = await supabase
        .from('v_dashboard_main')
        .select(`
            *,
            articulos:id_sku (familia, tipo_molde) 
        `)
        // Note: Joining with 'articulos' requires foreign key in View or direct Join. 
        // Since view aggregates, we might lose individual SKU attributes unless we group by them.
        // For simplicity in this View-based architecture, we'll assume the View logic handles joins 
        // OR we just filter client side what we have. 
        // Let's assume v_dashboard_main contains basic columns. If we need extra attrs, we might need a separate fetch.
        .order('fecha', { ascending: true });

    if (error) {
        console.error("Error loading dashboard:", error);
    } else {
        rawData = data || [];
        // Populate filter dropdowns based on unique values found in data
        populateDropdowns(rawData);
    }

    // 2. Initial Render
    updateDashboard();

    // 3. Setup Listeners
    setupFilters();
}

function populateDropdowns(data) {
    const lines = [...new Set(data.map(d => d.linea))].filter(Boolean);
    const skus = [...new Set(data.map(d => d.id_sku))].filter(Boolean);
    // Families and Molds might not be in the View `v_dashboard_main` as it aggregates by SKU.
    // If they are not in the view, we can't filter by them efficiently without fetch.
    // Assuming for now the view has placeholders or we just use SKU/Line. 
    // If user wants Family, we'd ideally join in the View.
    // Let's filter Lines logic.

    // Line Dropdown
    const skuList = document.getElementById('sku-list');
    skus.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s;
        skuList.appendChild(opt);
    });
}

function updateDashboard() {
    // 1. Filter Data
    const filtered = filterData(rawData);

    // 2. Aggregate Data based on Granularity
    const aggregated = aggregateData(filtered, currentGranularity);

    // 3. Render
    renderKPIs(filtered); // KPIs usually show "Current Status" regardless of chart granularity, or match? usually match.
    renderCharts(aggregated);
}

function filterData(data) {
    return data.filter(d => {
        // Date Filter (Month)
        if (activeFilters.date && !d.fecha.startsWith(activeFilters.date)) return false;

        // Line Filter
        if (activeFilters.line !== 'all' && d.linea !== activeFilters.line) return false;

        // SKU Filter
        if (activeFilters.sku && !d.id_sku.toLowerCase().includes(activeFilters.sku.toLowerCase())) return false;

        // Family/Molde: Requires these cols in View. If missing, pass.
        // if (activeFilters.familia !== 'all' && d.familia !== activeFilters.familia) return false;

        return true;
    });
}

// Granularity Control
window.setGranularity = (g) => {
    currentGranularity = g;
    // Update Active Buttons
    document.querySelectorAll('.granularity-btn').forEach(b => {
        if (b.dataset.g === g) {
            b.classList.add('active', 'text-white');
            b.classList.remove('text-zinc-400');
        } else {
            b.classList.remove('active', 'text-white');
            b.classList.add('text-zinc-400');
        }
    });
    updateDashboard();
}

function aggregateData(rows, granularity) {
    if (!rows.length) return { labels: [], plan: [], real: [], dailyReal: [] };

    // Grouping Logic
    const groups = {};

    rows.forEach(r => {
        let key = r.fecha; // Default Day
        const d = new Date(r.fecha); // Assume input is YYYY-MM-DD local

        if (granularity === 'week') {
            // Get CW
            const onejan = new Date(d.getFullYear(), 0, 1);
            const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
            key = `S${week}`;
        } else if (granularity === 'month') {
            key = d.toLocaleString(LOCALE, { month: 'short' });
        }

        if (!groups[key]) {
            groups[key] = {
                plan_inc: 0,
                real_inc: 0,
                plan_acc: 0, // Should take max of the group for cumulative? 
                // Logic: Cumulative is end of period. 
                // Incremental is sum of period.
                count: 0
            };
        }
        groups[key].plan_inc += r.plan_dia;
        groups[key].real_inc += r.real_dia;
        // For cumulative, we can't just sum cumulatives. 
        // We need to re-calculate cumulative from the sum of increments OR take the last value of the period.
        // Taking the max/last value of the period is safer for "As of End of Week".
        groups[key].plan_acc = r.plan_acumulado;
        groups[key].real_acc = r.real_acumulado;
    });

    const labels = Object.keys(groups);
    const dailyReal = labels.map(k => groups[k].real_inc);

    // For cumulative curve, we want the value at the END of the period
    // Since rows are ordered, the last overwrite in the loop above is correct for "End of Period".
    const plan = labels.map(k => groups[k].plan_acc);
    const real = labels.map(k => groups[k].real_acc);

    return { labels, plan, real, dailyReal };
}


function renderKPIs(rows) {
    // Current Status (Last available row of filtered set)
    const current = rows.length ? rows[rows.length - 1] : null;

    const elPlan = document.getElementById('kpi-plan');
    const elReal = document.getElementById('kpi-real');
    const elRealDelta = document.getElementById('kpi-real-delta');
    const elDelay = document.getElementById('kpi-delay');
    const elDelayCard = document.getElementById('kpi-card-delay');
    const elRitmo = document.getElementById('kpi-ritmo');
    const elEndDate = document.getElementById('kpi-end-date');

    const fmt = new Intl.NumberFormat(LOCALE);

    if (!current) {
        elPlan.textContent = '-';
        elReal.textContent = '-';
        elDelay.textContent = '-';
        return;
    }

    const planVal = current.plan_acumulado;
    const realVal = current.real_acumulado;
    const delayDays = current.dias_atraso;
    const ritmo = current.ritmo_promedio;

    elPlan.textContent = fmt.format(planVal);
    elReal.textContent = fmt.format(realVal);
    elRitmo.textContent = fmt.format(ritmo);

    const delta = planVal > 0 ? ((realVal - planVal) / planVal) * 100 : 0;
    const deltaSign = delta >= 0 ? '▲' : '▼';
    elRealDelta.textContent = `${deltaSign} ${Math.abs(delta).toFixed(1)}% vs Plan`;
    elRealDelta.className = `mt-2 text-xs font-medium ${delta >= 0 ? 'text-neon-lime' : 'text-red-400'}`;

    elDelay.textContent = Math.abs(delayDays).toFixed(1);
    if (delayDays > 0.5) {
        elDelayCard.classList.add('border-l-red-500');
        elDelayCard.classList.remove('border-l-transparent', 'border-l-neon-lime');
        elDelay.classList.add('text-red-400');
        elDelay.classList.remove('text-white');
    } else {
        elDelayCard.classList.add('border-l-neon-lime');
        elDelayCard.classList.remove('border-l-transparent', 'border-l-red-500');
        elDelay.classList.add('text-neon-lime');
        elDelay.classList.remove('text-red-400');
    }

    const today = new Date();
    const estDate = addDays(today, delayDays);
    elEndDate.textContent = estDate.toLocaleDateString(LOCALE, FORMAT_DATE);
}

function renderCharts(data) {
    const ctxCurve = document.getElementById('chart-curve').getContext('2d');
    const ctxBar = document.getElementById('chart-bar').getContext('2d');

    // Destroy previous instances to allow updates
    if (chartCurveInstance) chartCurveInstance.destroy();
    if (chartBarInstance) chartBarInstance.destroy();

    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { labels: { color: '#a1a1aa' } }
        },
        scales: {
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#a1a1aa' }
            },
            x: {
                grid: { display: false },
                ticks: { color: '#a1a1aa' }
            }
        }
    };

    chartCurveInstance = new Chart(ctxCurve, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Plan',
                    data: data.plan,
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: currentGranularity === 'day' ? 0 : 3
                },
                {
                    label: 'Real',
                    data: data.real,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3
                }
            ]
        },
        options: {
            ...commonOptions,
            interaction: { mode: 'index', intersect: false }
        }
    });

    chartBarInstance = new Chart(ctxBar, {
        type: 'bar', // Can switch to bar for Week/Month
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Prod. Periodo',
                    data: data.dailyReal,
                    backgroundColor: '#84cc16',
                    borderRadius: 4
                }
            ]
        },
        options: commonOptions
    });
}

function setupFilters() {
    document.getElementById('filter-date').addEventListener('change', (e) => {
        activeFilters.date = e.target.value;
        updateDashboard();
    });
    document.getElementById('filter-line').addEventListener('change', (e) => {
        activeFilters.line = e.target.value;
        updateDashboard();
    });
    document.getElementById('filter-sku').addEventListener('input', (e) => {
        activeFilters.sku = e.target.value;
        updateDashboard();
    });
    // Add Family/Molde listeners if UI exists
}

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}
