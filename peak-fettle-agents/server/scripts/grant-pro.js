#!/usr/bin/env node
/**
 * grant-pro.js — manually comp a user to Pro (or revoke the comp).
 *
 * Permanent admin tool for handing out free Pro access (promoters, friends,
 * beta testers) — independent of billing. Sets the billing-safe `comp_pro` flag
 * so a future RevenueCat/IAP sync never downgrades or charges a comped account.
 *
 * SECURITY: this is a server-side script that needs the DB connection string
 * (SUPABASE_DB_URL). It has NO public HTTP surface — run it where the env var is
 * set (e.g. the Railway shell, or locally with the var exported). Never expose
 * comp-granting as an unauthenticated endpoint.
 *
 * Usage:
 *   node scripts/grant-pro.js <email>            # grant Pro comp
 *   node scripts/grant-pro.js <email> --revoke   # revoke comp (back to free)
 *   node scripts/grant-pro.js --list             # list current comped accounts
 */

const { pool } = require('../db');

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--list')) {
        const { rows } = await pool.query(
            `SELECT email, tier, comp_pro FROM users WHERE comp_pro = TRUE ORDER BY email`
        );
        if (rows.length === 0) {
            console.log('No comped accounts.');
        } else {
            console.log(`Comped accounts (${rows.length}):`);
            for (const r of rows) console.log(`  ${r.email}  (tier=${r.tier})`);
        }
        return;
    }

    const email = args.find((a) => !a.startsWith('--'));
    const revoke = args.includes('--revoke');

    if (!email) {
        console.error('Usage: node scripts/grant-pro.js <email> [--revoke] | --list');
        process.exitCode = 1;
        return;
    }

    if (revoke) {
        const { rowCount } = await pool.query(
            `UPDATE users SET comp_pro = FALSE, tier = 'free', updated_at = NOW()
             WHERE LOWER(email) = LOWER($1)`,
            [email]
        );
        console.log(
            rowCount
                ? `Revoked Pro comp for ${email} (tier -> free).`
                : `No user found with email ${email}.`
        );
        // NOTE: once real billing exists, revoke should fall back to the user's
        // actual subscription status rather than hard 'free'.
        return;
    }

    const { rowCount } = await pool.query(
        `UPDATE users SET comp_pro = TRUE, tier = 'paid', updated_at = NOW()
         WHERE LOWER(email) = LOWER($1)`,
        [email]
    );
    console.log(
        rowCount
            ? `Granted Pro comp to ${email} (tier -> paid, comp_pro = true).`
            : `No user found with email ${email}.`
    );
}

main()
    .catch((err) => {
        console.error('grant-pro error:', err.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
