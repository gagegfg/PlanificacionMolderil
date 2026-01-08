document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
});

const LOCALE = 'es-AR';
const FORMAT_DATE = { day: '2-digit', month: '2-digit', year: 'numeric' };

async function initDashboard() {
    // 1. Fetch Data
    // For demo purposes, we will mock data if DB is empty to show the UI
    const { data, error } = await supabase
        .from('v_dashboard_main')
        .select('*')
        .order('fecha', { ascending: true });

    if (error) {
        console.error("Error loading dashboard:", error);
        // Fallback / Mock Data for visualization if table is empty or connection fails
        // In production, show error toast
    }

    // transform data for charts
    const chartData = processDataForCharts(data || []);

    // 2. Render KPIs
    renderKPIs(chartData);

    // 3. Render Charts
    renderCharts(chartData);

    // 4. Setup Filters
    setupFilters();
}

function processDataForCharts(rows) {
    // If no data, return empty structures
    if (!rows.length) return { labels: [], plan: [], real: [], raw: [] };

    const labels = rows.map(r => new Date(r.fecha).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' }));
    const plan = rows.map(r => r.plan_acumulado);
    const real = rows.map(r => r.real_acumulado);
    const dailyPlan = rows.map(r => r.plan_dia);
    const dailyReal = rows.map(r => r.real_dia);

    // Last row for current KPIs
    const current = rows[rows.length - 1];

    return {
        labels,
        plan,
        real,
        dailyPlan,
        dailyReal,
        current, // Snapshot of latest
        raw: rows
    };
}

function renderKPIs(data) {
    if (!data.current) return;

    // Elements
    const elPlan = document.getElementById('kpi-plan');
    const elReal = document.getElementById('kpi-real');
    const elRealDelta = document.getElementById('kpi-real-delta');
    const elDelay = document.getElementById('kpi-delay');
    const elDelayCard = document.getElementById('kpi-card-delay');
    const elRitmo = document.getElementById('kpi-ritmo');
    const elEndDate = document.getElementById('kpi-end-date');

    // Values
    const planVal = data.current.plan_acumulado;
    const realVal = data.current.real_acumulado;
    const delayDays = data.current.dias_atraso;
    const ritmo = data.current.ritmo_promedio;

    // Formatting
    const fmt = new Intl.NumberFormat(LOCALE);

    elPlan.textContent = fmt.format(planVal);
    elReal.textContent = fmt.format(realVal);
    elRitmo.textContent = fmt.format(ritmo);

    // Delta %
    const delta = planVal > 0 ? ((realVal - planVal) / planVal) * 100 : 0;
    const deltaSign = delta >= 0 ? '▲' : '▼';
    elRealDelta.textContent = `${deltaSign} ${Math.abs(delta).toFixed(1)}% vs Plan`;
    elRealDelta.className = `mt-2 text-xs font-medium ${delta >= 0 ? 'text-neon-lime' : 'text-red-400'}`;

    // Delay Logic
    // If delay > 0 (meaning behind schedule), RED. If <= 0 (ahead or on time), GREEN/NEUTRAL.
    elDelay.textContent = Math.abs(delayDays).toFixed(1);
    // Visual logic: Delay = (Plan - Real) / Rate. Positive result means we are BEHIND.
    // In SQL view: (plan - real). If plan > real => positive => behind.
    if (delayDays > 0.5) { // intolerance threshold
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

    // Estimated End Date
    // Current Date + (Remaining Plan / Ritmo)
    // Here we approximate end of known plan or project end. 
    // Usually "Estimated End" means when we catch up or finish the total order used in "Plan".
    // For this dashboard, let's project based on remaining Gap if we assume a target.
    // Simplifying: Just showing Today + Delay Days
    const today = new Date();
    const estDate = addDays(today, delayDays);
    elEndDate.textContent = estDate.toLocaleDateString(LOCALE, FORMAT_DATE);
}

function renderCharts(data) {
    const ctxCurve = document.getElementById('chart-curve').getContext('2d');
    const ctxBar = document.getElementById('chart-bar').getContext('2d');

    // Common Config
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

    // 1. Curva S (Line)
    new Chart(ctxCurve, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Plan Acumulado',
                    data: data.plan,
                    borderColor: '#06b6d4', // neon-cyan
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                },
                {
                    label: 'Real Acumulado',
                    data: data.real,
                    borderColor: '#8b5cf6', // neon-violet
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

    // 2. Barras (Bar)
    new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Prod. Real',
                    data: data.dailyReal,
                    backgroundColor: '#84cc16', // neon-lime
                    borderRadius: 4
                }
            ]
        },
        options: commonOptions
    });
}

function exportData() {
    // Basic CSV export of currently visible data
    // TODO: implement using raw data
    alert("Funcionalidad de exportación en desarrollo.");
}

function setupFilters() {
    // Listeners for dropdowns
}

// Utils
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}
