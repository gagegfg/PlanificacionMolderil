// CONFIGURATION
// TODO: Replace with your actual project keys from Supabase Dashboard -> Settings -> API
const SUPABASE_URL = 'https://sfjrhgauoeymlepmlnxm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_CpaarW2rWf2n8_DR-woZIA_OWa1zUIE';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auth Functions
async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });
    return { data, error };
}

async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (!error) {
        window.location.href = 'login.html';
    }
}

async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

// Protected Route Logic
// Protected Route Logic
// Check if we are NOT on login page
const currentPath = window.location.pathname;
if (!currentPath.includes('login.html')) {
    checkSession().then(session => {
        if (!session) {
            // If strictly on root or index, redirect. Avoid loops if already redirecting.
            window.location.href = 'login.html';
        } else {
            console.log("Logged in as:", session.user.email);
            // REVEAL CONTENT
            const appContent = document.getElementById('app-content');
            if (appContent) appContent.style.display = 'block';
        }
    });

    // Logout Handler
    document.addEventListener('DOMContentLoaded', () => {
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', signOut);
        }
    });
}
