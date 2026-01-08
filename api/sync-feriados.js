import { createClient } from '@supabase/supabase-js';

export const config = {
    runtime: 'edge',
};

// Environment variables should be set in Vercel Project Settings
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(request) {
    // Security check: Verify a secret cron token if needed, or just let Vercel Cron handle it.
    // For now, open execution.

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return new Response(JSON.stringify({ error: 'Missing DataBase Config' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
        });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const year = new Date().getFullYear();

    try {
        // 1. Fetch from Public API
        const res = await fetch(`https://nolaborables.com.ar/api/v2/feriados/${year}`);
        if (!res.ok) throw new Error('Failed to fetch external API');

        const feriados = await res.json();

        // 2. Transform for DB
        // API returns: [{ motivo: str, tipo: str, dia: int, mes: int, id: str, ... }]
        const records = feriados.map(f => {
            // Pad month/day
            const mes = String(f.mes).padStart(2, '0');
            const dia = String(f.dia).padStart(2, '0');
            return {
                fecha: `${year}-${mes}-${dia}`,
                descripcion: f.motivo,
                tipo: f.tipo
            };
        });

        // 3. Upsert to Supabase
        const { data, error } = await supabase
            .from('feriados_ar')
            .upsert(records, { onConflict: 'fecha' });

        if (error) throw error;

        return new Response(JSON.stringify({
            success: true,
            message: `Synced ${records.length} holidays for ${year}`
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
        });
    }
}
