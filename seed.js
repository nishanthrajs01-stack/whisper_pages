import bcrypt from 'bcryptjs';
import { initDb, dbQuery } from './database.js';

const SEED_USERS = [
  { pen_name: 'MidnightScribbler', age_bracket: '18_25', password: 'Password123!' },
  { pen_name: 'EchoingWhisper', age_bracket: '26_35', password: 'Password123!' },
  { pen_name: 'SilentDreamer', age_bracket: '18_25', password: 'Password123!' },
  { pen_name: 'VelvetInk', age_bracket: '36_50', password: 'Password123!' },
  { pen_name: 'SolitarySailor', age_bracket: '50_plus', password: 'Password123!' },
  { pen_name: 'LostInThought', age_bracket: 'under_18', password: 'Password123!' },
  { pen_name: 'AutumnLeaves', age_bracket: '26_35', password: 'Password123!' },
  { pen_name: 'ForgottenEcho', age_bracket: '36_50', password: 'Password123!' },
  { pen_name: 'OceanBreeze', age_bracket: '18_25', password: 'Password123!' },
  { pen_name: 'ShadowWriter', age_bracket: '26_35', password: 'Password123!' }
];

const SEED_POSTS_TEMPLATE = [
  [
    {
      content: "The City in the Rain\n\nI watched the droplets race down the glass pane of the café. Nobody knows who I am here, and that is a relief. Under the neon glow, the streets shine like mirrors. I write because the silence in my room is too loud.",
      content_rating: 'general',
      tags: 'solitude, reflection, urban'
    },
    {
      content: "A Letter Unsent\n\nI still carry the words I wanted to say to you. They sit in the drawer of my mind like old keys to locks that have been changed. Sometimes it is easier to whisper to strangers than to speak to the ones we loved.",
      content_rating: 'general',
      tags: 'love, regret, letters'
    },
    {
      content: "Chasing Shadows\n\nWe build monuments out of expectations and wonder why they crush us. I spent years trying to be the person my family wanted. In the end, I only found myself when I let them go.",
      content_rating: 'mature',
      tags: 'identity, freedom, family'
    }
  ],
  [
    {
      content: "The Ghost in the Station\n\nEvery day at 5:00 PM, I see the same old man waiting on platform 4. He doesn't board any train. He just watches. I think he is waiting for someone who left years ago, or perhaps he is waiting for his own departure.",
      content_rating: 'general',
      tags: 'story, observation, life'
    },
    {
      content: "Confessions of a Night Worker\n\nWhen the world sleeps, the city belongs to us. The bakers, the sweepers, the insomniacs. There is a strange camaraderie in the dark. We exchange nods, acknowledging our shared membership in the night shift.",
      content_rating: 'general',
      tags: 'night, society, people'
    },
    {
      content: "Echoes of the Past\n\nI returned to my childhood neighborhood. The swing set is gone, replaced by a sleek parking structure. Time doesn't just pass; it paves over everything we once held dear.",
      content_rating: 'general',
      tags: 'nostalgia, childhood, change'
    }
  ],
  [
    {
      content: "Quiet Mornings\n\nThere is a specific hour between night and day when the world holds its breath. The coffee is brewing, the birds are starting, and for a few minutes, everything is peaceful.",
      content_rating: 'general',
      tags: 'nature, peace, morning'
    },
    {
      content: "Masks We Wear\n\nWe wear suits and smiles, pretending we have it all figured out. But if you look closely in the subway mirrors, you see the exhaustion. We are all just children wearing adult clothes.",
      content_rating: 'general',
      tags: 'philosophy, society, truth'
    },
    {
      content: "Forbidden Desires\n\nThere are parts of us we hide away, locked in chest drawers we never open in public. The thoughts that linger when the lights go out. We fear the judgment of peers, but here we can breathe.",
      content_rating: '18+',
      tags: 'secrets, desire, raw'
    }
  ],
  [
    {
      content: "The Masterpiece\n\nI painted a canvas entirely in black. People called it pretentious. But to me, it was the only way to depict the weight of what I was carrying inside. Sometimes color is a lie.",
      content_rating: 'general',
      tags: 'art, depression, expression'
    },
    {
      content: "The Bookstore at the End of the Road\n\nIt smelled of dust and paper. The owner didn't look up when I entered. I spent three hours reading in the corner, and nobody asked me to leave. A sanctuary in a busy world.",
      content_rating: 'general',
      tags: 'books, sanctuary, peace'
    },
    {
      content: "A Shattered Glass\n\nIt took one second to break the glass, and three hours to sweep up the pieces. Some relationships are just like that. You can sweep up the shards, but you'll still step on them weeks later.",
      content_rating: 'mature',
      tags: 'relationships, pain, breakup'
    }
  ],
  [
    {
      content: "sailing the Open Sea\n\nI bought a small boat when I retired. My children thought I was crazy. But out there, with nothing but the horizon, I have never felt more sane. The sea doesn't care about your resume.",
      content_rating: 'general',
      tags: 'sea, adventure, retirement'
    },
    {
      content: "Old Friendships\n\nWe haven't spoken in ten years. But if you called me at 3:00 AM, I would still drive across state lines to help you. That is the contract of youth.",
      content_rating: 'general',
      tags: 'friendship, loyalty, memories'
    },
    {
      content: "The Last Sunset\n\nI am watching the sun go down, wondering how many more of these I will see. It sounds grim, but it actually makes the colors look much brighter.",
      content_rating: 'general',
      tags: 'aging, wisdom, appreciation'
    }
  ],
  [
    {
      content: "School Cafeteria Blues\n\nI sit alone at lunch. It's fine, I have my notebook. But sometimes I wish someone would just ask if the seat next to me is taken. Adolescence is a waiting game.",
      content_rating: 'general',
      tags: 'youth, school, loneliness'
    },
    {
      content: "The Secret Diary\n\nIf my parents found this notebook, I would have to run away. They think I am a perfect student, but I am actually just very good at lying. Writing here is my only escape.",
      content_rating: 'general',
      tags: 'secrets, teen, honesty'
    },
    {
      content: "Growing Pains\n\nMy body is changing, my friends are changing, and I don't feel like I belong anywhere. I wish there was a fast-forward button to age 21.",
      content_rating: 'general',
      tags: 'youth, growth, confusion'
    }
  ],
  [
    {
      content: "Leaves of Gold\n\nAutumn is the year's last smile. The forest path is covered in red and gold. I walked for hours without meeting another soul. Nature is the best therapist.",
      content_rating: 'general',
      tags: 'autumn, nature, walking'
    },
    {
      content: "The Empty Chair\n\nMy mother passed away last November. Her chair still sits in the corner of the dining room. None of us have the courage to sit in it, nor to move it.",
      content_rating: 'general',
      tags: 'grief, family, loss'
    },
    {
      content: "Stargazing\n\nWe look at stars that died millions of years ago. Our problems are so small in the grand cosmic design. It is deeply comforting to know how insignificant we are.",
      content_rating: 'general',
      tags: 'cosmic, stars, perspective'
    }
  ],
  [
    {
      content: "The Unheard Voice\n\nI speak, but my voice is drowned out by louder, more confident people. Here, my words are written. You have to read them. You cannot interrupt me.",
      content_rating: 'general',
      tags: 'introvert, writing, voice'
    },
    {
      content: "Regrets in the Kitchen\n\nI burnt the toast this morning, and it made me cry. Obviously it wasn't about the toast. It was about everything else I've burnt down this year.",
      content_rating: 'mature',
      tags: 'emotion, breakdown, healing'
    },
    {
      content: "The Art of Let Go\n\nWe hold on to grudges like hot coals, hoping to throw them at the other person. But we are the ones getting burned. Today, I drop the coal.",
      content_rating: 'general',
      tags: 'forgiveness, growth, life'
    }
  ],
  [
    {
      content: "Ocean Breeze\n\nI live by the coast now. The salt air eats the paint off the railing, but it fills my lungs with something clean. If you are lost, find a coast.",
      content_rating: 'general',
      tags: 'ocean, healing, travel'
    },
    {
      content: "The Lighthouse Keeper\n\nI visited an old lighthouse. The keeper told me his job was obsolete, automated. But he still keeps the light on manually. Some traditions are kept alive by sheer stubbornness.",
      content_rating: 'general',
      tags: 'history, lighthouse, ocean'
    },
    {
      content: "Behind Closed Doors\n\nPeople look at a beautiful house and assume a beautiful life. They don't hear the shouting through the walls or see the cold dinners eaten in silence.",
      content_rating: 'general',
      tags: 'facade, society, secrets'
    }
  ],
  [
    {
      content: "Shadow Play\n\nI like to make shadow puppets on the wall before I go to sleep. It reminds me that light is required to create shadows. Even in our darkest moments, there is a source of light nearby.",
      content_rating: 'general',
      tags: 'hope, light, metaphor'
    },
    {
      content: "A Cup of Tea\n\nChamomile tea at midnight is my version of therapy. The steam rises, carrying away the worries of the day. A simple ritual that keeps me anchored.",
      content_rating: 'general',
      tags: 'ritual, calm, night'
    },
    {
      content: "The Final Act\n\nWe spend our lives preparing for the future, but the future is just a series of nows. If we don't live in the now, we are just spectators in our own play.",
      content_rating: 'general',
      tags: 'mindfulness, wisdom, present'
    }
  ]
];

async function runSeed() {
  await initDb();

  console.log('Seeding launch content...');
  const salt = await bcrypt.genSalt(10);
  const hashedPass = await bcrypt.hash('Password123!', salt);
  const now = new Date().toISOString();

  for (let i = 0; i < SEED_USERS.length; i++) {
    const user = SEED_USERS[i];
    const userId = `seed_usr_${i + 1}`;
    
    // Check if user already exists
    const exists = await dbQuery.get('SELECT id FROM accounts WHERE id = ?', [userId]);
    if (exists) {
      console.log(`User ${user.pen_name} already seeded, skipping.`);
      continue;
    }

    // Insert user
    await dbQuery.run(
      `INSERT INTO accounts (id, pen_name, password_hash, age_bracket, created_at, last_active_at, status, is_seed, ip_address) 
       VALUES (?, ?, ?, ?, ?, ?, 'active', 1, '127.0.0.1')`,
      [userId, user.pen_name, hashedPass, user.age_bracket, now, now]
    );
    console.log(`Seeded user: ${user.pen_name}`);

    // Insert posts for this user
    const posts = SEED_POSTS_TEMPLATE[i] || [];
    for (let j = 0; j < posts.length; j++) {
      const post = posts[j];
      const postId = `seed_post_${i + 1}_${j + 1}`;
      
      await dbQuery.run(
        `INSERT INTO posts (id, author_id, content, content_rating, tags, created_at, is_seed) 
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [postId, userId, post.content, post.content_rating, post.tags, now]
      );
    }
    console.log(`  Seeded ${posts.length} posts for ${user.pen_name}`);
  }

  console.log('Seed content generation complete.');
}

runSeed().catch(err => {
  console.error('Seeding failed:', err);
});
