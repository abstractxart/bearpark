// Create a new raid (admin only)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Admin wallet address (only this wallet can create raids)
const ADMIN_WALLET = 'rU2AviYiGZnWXmgDQ1bpkY8Nak4f3ZQ7Jy'; // Replace with your actual admin wallet

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    admin_wallet,
    raid_title,
    raid_url,
    raid_description,
    target_account,
    points_per_participation,
    duration_hours
  } = req.body;

  // Verify admin
  if (admin_wallet !== ADMIN_WALLET) {
    return res.status(403).json({ error: 'Unauthorized: Admin access required' });
  }

  // Validate required fields
  if (!raid_title || !raid_url || !target_account) {
    return res.status(400).json({
      error: 'Missing required fields: raid_title, raid_url, target_account'
    });
  }

  try {
    // Calculate end time
    const endTime = duration_hours
      ? new Date(Date.now() + duration_hours * 60 * 60 * 1000).toISOString()
      : null;

    // Create raid
    const { data: raid, error } = await supabase
      .from('raids')
      .insert([
        {
          raid_title,
          raid_url,
          raid_description: raid_description || '',
          target_account,
          points_per_participation: points_per_participation || 20,
          end_time: endTime,
          is_active: true,
          created_by: admin_wallet
        }
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: 'Raid created successfully',
      raid
    });

  } catch (error) {
    console.error('Error creating raid:', error);
    return res.status(500).json({
      error: 'Failed to create raid',
      details: error.message
    });
  }
}
