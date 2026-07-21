// Whisper Pages SPA Engine
const state = {
  token: localStorage.getItem('token') || null,
  user: null,
  activeView: 'home',
  currentDraftId: null,
  autosaveInterval: null
};

// Application Router Map
const routes = {
  '/': renderHome,
  '/posts/:id': renderPost,
  '/profiles/:name': renderProfile,
  '/wall': renderWall,
  '/publish': renderPublish,
  '/login': renderLogin,
  '/signup': renderSignup,
  '/admin': renderAdmin
};

// Procedural geometric wax seal derived from pen name hashing (matches templates)
function generateInkSeal(username) {
  if (!username) return '';
  
  // Custom hash helper
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Template background colors
  const bgColors = ['#EFDDE3', '#E3D9E8', '#E9DFE4', '#E6E8E3', '#F2E4E9'];
  // Template accent colors
  const accentColors = ['#A0637A', '#7C4A5D', '#332B39', '#867C8A', '#7C8B72'];
  
  const bgColor = bgColors[Math.abs(hash) % bgColors.length];
  const accentColor = accentColors[Math.abs(hash >> 3) % accentColors.length];
  
  // Seeded selection of shape type (0: ellipse, 1: rect/square, 2: polygon, 3: overlapping nodes)
  const shapeType = Math.abs(hash >> 6) % 4;
  
  let innerShape = '';
  if (shapeType === 0) {
    innerShape = `<ellipse cx="16" cy="16" rx="8" ry="10" fill="${accentColor}"/>`;
  } else if (shapeType === 1) {
    innerShape = `<rect x="9" y="9" width="14" height="14" fill="${accentColor}" transform="rotate(${Math.abs(hash % 90)} 16 16)"/>`;
  } else if (shapeType === 2) {
    const polyType = Math.abs(hash % 2);
    if (polyType === 0) {
      innerShape = `<polygon points="16,7 25,23 7,23" fill="${accentColor}"/>`;
    } else {
      innerShape = `<polygon points="16,7 25,16 16,25 7,16" fill="${accentColor}"/>`;
    }
  } else {
    innerShape = `
      <circle cx="13" cy="16" r="5.5" fill="${accentColor}" opacity="0.8"/>
      <circle cx="19" cy="16" r="5.5" fill="${accentColor}" opacity="0.6"/>
    `;
  }
  
  return `
    <svg class="seal" viewBox="0 0 32 32" style="display:inline-block; vertical-align:middle;" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="${bgColor}"/>
      ${innerShape}
    </svg>
  `;
}

// Initialize Application
async function initApp() {
  initFeedbackWidget();
  initGuidelinesModal();
  
  // Mobile Nav Drawer Toggle
  const navToggleBtn = document.getElementById('nav-toggle-btn');
  const mainNav = document.getElementById('main-nav');
  if (navToggleBtn && mainNav) {
    navToggleBtn.addEventListener('click', () => {
      mainNav.classList.toggle('open');
      navToggleBtn.classList.toggle('active');
    });
  }

  if (state.token) {
    try {
      const response = await apiFetch('/api/auth/me');
      if (response.user) {
        state.user = response.user;
      } else {
        logout();
      }
    } catch (err) {
      logout();
    }
  }

  window.addEventListener('hashchange', router);
  window.addEventListener('load', router);
  
  router();
}

// Router Handler
function router() {
  const hash = window.location.hash || '#/';
  let viewFn = null;
  let params = {};
  
  // Close mobile nav drawer on navigation
  const mainNav = document.getElementById('main-nav');
  const navToggleBtn = document.getElementById('nav-toggle-btn');
  if (mainNav) mainNav.classList.remove('open');
  if (navToggleBtn) navToggleBtn.classList.remove('active');

  if (!hash.startsWith('#/publish') && state.autosaveInterval) {
    clearInterval(state.autosaveInterval);
    state.autosaveInterval = null;
  }

  if (routes[hash.substring(1)]) {
    viewFn = routes[hash.substring(1)];
  } else {
    const routeKeys = Object.keys(routes);
    for (const key of routeKeys) {
      if (key.includes('/:')) {
        const routePattern = new RegExp('^' + key.replace(/:[^\s/]+/g, '([\\w-]+)') + '$');
        const match = hash.substring(1).match(routePattern);
        if (match) {
          viewFn = routes[key];
          const paramName = key.split('/:')[1];
          params[paramName] = match[1];
          break;
        }
      }
    }
  }

  if (!viewFn) {
    window.location.hash = '#/';
    return;
  }

  renderNavbar();
  renderInactivityBanner();
  viewFn(params);
}

// --- API CLIENT UTILITY ---
async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  
  const config = {
    ...options,
    headers: {
      ...headers,
      ...options.headers
    }
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Server error occurred.');
    }
    return data;
  } catch (err) {
    console.error(`API Fetch Error [${url}]:`, err.message);
    throw err;
  }
}

// Global Notification Helper
function showToast(message, type = 'info') {
  let toast = document.getElementById('global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-toast';
    toast.style.cssText = `
      position: fixed;
      top: 5rem;
      right: 2rem;
      padding: 0.75rem 1.5rem;
      border-radius: 3px;
      z-index: 10000;
      color: #fff;
      font-weight: 500;
      font-family: 'Inter', sans-serif;
      box-shadow: 0 4px 12px rgba(51,43,57,0.15);
      transition: opacity 0.3s ease;
      border: 1px solid rgba(255,255,255,0.1);
    `;
    document.body.appendChild(toast);
  }

  const bgColors = {
    info: '#867C8A',      // Muted
    success: '#7C8B72',   // Quiet Sage
    error: '#A36B73',     // Soft Rose
    warning: '#B69E79'    // Soft Amber
  };

  toast.style.background = bgColors[type];
  toast.innerText = message;
  toast.style.opacity = '1';
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 4000);
}

// Log out handler
function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  showToast('Logged out successfully.', 'info');
  window.location.hash = '#/';
}

// Navbar Renderer
function renderNavbar() {
  const navContainer = document.getElementById('main-nav');
  if (!navContainer) return;

  const currentHash = window.location.hash || '#/';

  let html = `
    <a href="#/" class="nav-item ${currentHash === '#/' ? 'active' : ''}">Browse</a>
    <a href="#/wall" class="nav-item ${currentHash === '#/wall' ? 'active' : ''}">Wall</a>
    <a href="javascript:void(0)" class="nav-item" onclick="showGuidelines()">Guidelines</a>
  `;

  if (state.user) {
    html += `
      <a href="#/publish" class="nav-item ${currentHash === '#/publish' ? 'active' : ''}">Write</a>
      <a href="#/profiles/${state.user.pen_name}" class="nav-item ${currentHash.startsWith('#/profiles') ? 'active' : ''}">Profile</a>
    `;
    
    if (state.user.role === 'admin') {
      html += `<a href="#/admin" class="nav-item ${currentHash.startsWith('#/admin') ? 'active' : ''}">Admin Control</a>`;
    }

    html += `<span class="nav-item" style="color: var(--muted); font-family: 'IBM Plex Mono', monospace; font-size:11px;">(${state.user.pen_name})</span>`;
    html += `<button class="btn" id="logout-nav-btn">Logout</button>`;
  } else {
    html += `
      <button class="btn" onclick="window.location.hash = '#/login'">Log in</button>
      <button class="btn btn-primary" onclick="window.location.hash = '#/signup'">Create pen name</button>
    `;
  }

  navContainer.innerHTML = html;

  const logoutBtn = document.getElementById('logout-nav-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
}

// Inactivity Banner Indicator (FR-10.1)
function renderInactivityBanner() {
  const oldBanner = document.getElementById('inactivity-banner');
  if (oldBanner) oldBanner.remove();

  if (!state.user || state.user.role === 'admin' || !state.user.last_active_at) return;

  const lastActive = new Date(state.user.last_active_at);
  const diffTime = Math.abs(new Date() - lastActive);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays >= 250) {
    const daysRemaining = 300 - diffDays;
    const banner = document.createElement('div');
    banner.id = 'inactivity-banner';
    banner.className = 'inactivity-warning-banner';
    banner.innerHTML = `⚠️ This account has been inactive for ${diffDays} days. It will be permanently deleted in ${daysRemaining} days unless you log in.`;
    document.body.prepend(banner);
  }
}

// --- VIEW: HOME FEED ---
async function renderHome() {
  const root = document.getElementById('app-root');
  
  let heroHtml = '';
  if (!state.user) {
    heroHtml = `
      <div class="hero">
        <div class="eyebrow">No names. No tracking. Just writing.</div>
        <h1>Write the story only your pen name will ever own.</h1>
        <p>A free space to publish under a name you choose — no email, no profile photo, no history following you in.</p>
        <div class="hero-actions">
          <button class="btn btn-primary btn-lg" onclick="window.location.hash = '#/signup'">Start writing</button>
          <button class="btn btn-lg" onclick="document.getElementById('main-feed-title').scrollIntoView({ behavior: 'smooth' })">Read stories</button>
        </div>
      </div>
    `;
  } else {
    heroHtml = `
      <div class="hero" style="padding: 50px 24px 20px;">
        <div class="eyebrow">Welcome back, ${state.user.pen_name}</div>
        <h1>Speak honestly. Write freely.</h1>
        <p style="margin-bottom: 20px;">Your identity remains entirely yours. What would you like to write today?</p>
        <div class="hero-actions">
          <button class="btn btn-primary" onclick="window.location.hash = '#/publish'">Create New Story</button>
          <button class="btn" onclick="window.location.hash = '#/wall'">Post on Wall</button>
        </div>
      </div>
    `;
  }

  root.innerHTML = `
    ${heroHtml}
    
    <div class="feed">
      <div class="form-group" style="margin-bottom: 2rem;">
        <input type="text" id="tag-search-input" placeholder="Search stories by tag (e.g. memoir)..." />
      </div>

      <div class="label" id="trending-feed-title">Trending this week</div>
      <div id="trending-feed-container">
        <div class="loader-container"><div class="spinner"></div></div>
      </div>

      <div class="label" id="main-feed-title" style="margin-top: 30px;">All Stories</div>
      <div id="main-feed-container">
        <div class="loader-container"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  try {
    const trending = await apiFetch('/api/posts/trending');
    const allPosts = await apiFetch('/api/posts');
    
    renderFeedList('trending-feed-container', trending, true);
    renderFeedList('main-feed-container', allPosts, false);
  } catch (err) {
    showToast(err.message, 'error');
  }

  const search = document.getElementById('tag-search-input');
  search.addEventListener('input', debounce(async (e) => {
    const tag = e.target.value.trim();
    const container = document.getElementById('main-feed-container');
    container.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
    
    try {
      const posts = await apiFetch(`/api/posts${tag ? '?tag=' + encodeURIComponent(tag) : ''}`);
      renderFeedList('main-feed-container', posts, false);
    } catch (err) {
      container.innerHTML = `<p class="text-center" style="color: var(--rose)">${err.message}</p>`;
    }
  }, 400));
}

function renderFeedList(containerId, posts, isTrendingList = false) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (posts.length === 0) {
    container.innerHTML = `<p style="color: var(--muted); font-style: italic; font-size: 13px; margin: 10px 0;">No posts found here yet.</p>`;
    return;
  }

  let html = '';
  posts.forEach(post => {
    const tagsHtml = post.tags 
      ? post.tags.split(',').map(t => `<span class="tag">#${t.trim()}</span>`).join('') 
      : '';
      
    const plainExcerpt = isTrendingList && post.is_preview 
      ? post.content 
      : (post.content.length > 200 ? post.content.substring(0, 200) + '...' : post.content);

    const wordCount = post.content.split(/\s+/).filter(Boolean).length;
    const readTime = Math.max(1, Math.ceil(wordCount / 200));

    const inkSeal = generateInkSeal(post.author_name);

    html += `
      <div class="card post-card" onclick="window.location.hash = '#/posts/${post.id}'">
        <div class="card-top">
          ${inkSeal}
          <div>
            <div class="pen-name">${post.author_name}</div>
            <div class="meta">${formatDate(post.created_at)} · ${readTime} min read</div>
          </div>
          <span class="post-rating ${post.content_rating === '18+' ? '18plus' : post.content_rating}" style="margin-left:auto;">${post.content_rating}</span>
        </div>
        <h3>${escapeHtml(post.content.split('\n')[0].replace(/^#+\s*/, '')).substring(0, 80)}</h3>
        <p>${escapeHtml(plainExcerpt)}</p>
        <div class="tags">${tagsHtml}</div>
        <div class="card-footer">
          <span>♡ ${post.likes || 0}</span>
          <span>💬 ${post.comments || 0}</span>
          <span style="margin-left:auto; cursor:pointer;" onclick="event.stopPropagation(); showReportModal('post', '${post.id}')">⚑ report</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// --- VIEW: SINGLE POST DETAILS ---
async function renderPost({ id }) {
  const root = document.getElementById('app-root');
  root.innerHTML = `<div class="container"><div class="loader-container"><div class="spinner"></div></div></div>`;

  try {
    const data = await apiFetch(`/api/posts/${id}`);
    const post = data.post;
    const comments = data.comments;

    const tagsHtml = post.tags 
      ? post.tags.split(',').map(t => `<span class="tag">#${t.trim()}</span>`).join('') 
      : '';

    const wordCount = post.content.split(/\s+/).filter(Boolean).length;
    const readTime = Math.max(1, Math.ceil(wordCount / 200));
    const metaText = `${formatDate(post.created_at)} · ${readTime} min read`;

    const bodyContent = post.is_preview 
      ? `
        <div class="post-excerpt">${escapeHtml(post.content)}</div>
        <div class="gated-preview-banner">
          <h3>The rest of this trending post is gated</h3>
          <p style="color: var(--muted); font-size: 13px;">Whisper Pages keeps popular content available to registered accounts only to prevent mass scraping.</p>
          <a href="#/signup" class="btn btn-primary btn-sm" style="margin-top: 12px;">Get Pen Name to Read Full Text</a>
        </div>
      `
      : `<div class="post-detail-content">${markdownToHtml(post.content)}</div>`;

    const inkSeal = generateInkSeal(post.author_name);

    root.innerHTML = `
      <div class="container">
        <div class="reading-column-wrapper">
          <div class="card" style="margin-bottom: 20px;">
            <div class="card-top">
              ${inkSeal}
              <div>
                <div class="pen-name" style="cursor:pointer; text-decoration:underline" id="view-author-link">${post.author_name}</div>
                <div class="meta">${metaText}</div>
              </div>
              <span class="post-rating ${post.content_rating === '18+' ? '18plus' : post.content_rating}" style="margin-left:auto;">${post.content_rating}</span>
            </div>
            
            ${bodyContent}
            
            <div class="tags" style="margin-top: 20px;">${tagsHtml}</div>
            
            <div class="card-footer" style="margin-top: 14px;">
              <button class="btn btn-sm" id="like-post-btn" ${!state.user ? 'disabled' : ''}>
                ${post.userLiked ? '❤️ Liked' : '♡ Like'} (${post.likes})
              </button>
              <button class="btn btn-sm" id="report-post-btn" ${!state.user ? 'disabled' : ''} style="margin-left:auto;">
                ⚑ Report
              </button>
            </div>
          </div>

          <!-- Comments Section -->
          <div class="comments-section">
            <h3 style="font-family:'Fraunces', serif; margin-bottom:14px;">Comments (${comments.length})</h3>
            
            ${state.user ? `
              <form id="comment-form" style="margin-top: 15px; margin-bottom:20px;">
                <div class="form-group">
                  <textarea id="comment-input" placeholder="Add a comment on this writing..." required></textarea>
                </div>
                <button type="submit" class="btn btn-primary btn-sm">Post Comment</button>
              </form>
            ` : `
              <p style="color: var(--muted); font-style: italic; margin-top: 12px; font-size:13px;">Please <a href="#/login">login</a> or <a href="#/signup">signup</a> to leave a comment.</p>
            `}

            <div class="comments-list" id="comments-container">
              <!-- Injected Comments -->
            </div>
          </div>
        </div>
      </div>
    `;

    renderCommentsList(comments, post.author_id);

    document.getElementById('view-author-link').addEventListener('click', () => {
      if (!state.user) {
        showToast('You must be logged in to view writer profiles.', 'warning');
        window.location.hash = '#/login';
      } else {
        window.location.hash = `#/profiles/${post.author_name}`;
      }
    });

    if (state.user) {
      document.getElementById('like-post-btn').addEventListener('click', async () => {
        try {
          const res = await apiFetch(`/api/posts/${post.id}/like`, { method: 'POST' });
          renderPost({ id });
          showToast(res.liked ? 'Liked post.' : 'Unliked post.', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      document.getElementById('report-post-btn').addEventListener('click', () => {
        showReportModal('post', post.id);
      });

      const commentForm = document.getElementById('comment-form');
      if (commentForm) {
        commentForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const content = document.getElementById('comment-input').value.trim();
          try {
            await apiFetch(`/api/posts/${post.id}/comments`, {
              method: 'POST',
              body: JSON.stringify({ content })
            });
            showToast('Comment published.', 'success');
            renderPost({ id });
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }
    }
  } catch (err) {
    root.innerHTML = `
      <div class="container text-center" style="padding-top: 5rem;">
        <h2 style="color: var(--rose)">Error Loading Writing</h2>
        <p>${err.message}</p>
        <a href="#/" class="btn btn-secondary btn-sm" style="margin-top: 1rem;">Back Home</a>
      </div>
    `;
  }
}

function renderCommentsList(comments, postAuthorId) {
  const container = document.getElementById('comments-container');
  if (comments.length === 0) {
    container.innerHTML = `<p style="color: var(--muted); font-style: italic; font-size: 13px;">No comments yet.</p>`;
    return;
  }

  let html = '';
  comments.forEach(c => {
    const canDelete = state.user && (state.user.id === c.author_id || state.user.id === postAuthorId);
    const inkSeal = generateInkSeal(c.author_name);

    html += `
      <div class="comment-item">
        <div class="comment-meta">
          <div class="comment-author-wrapper">
            ${inkSeal}
            <div>
              <div class="pen-name">${c.author_name}</div>
              <div class="meta">${formatDate(c.created_at)}</div>
            </div>
          </div>
          <div style="display: flex; gap: 12px; align-items:center;">
            ${canDelete ? `<button class="comment-delete-btn" onclick="deleteComment('${c.id}', '${c.post_id}')">Delete</button>` : ''}
            ${state.user ? `<button class="comment-delete-btn" style="color: var(--muted)" onclick="showReportModal('comment', '${c.id}')">⚑ report</button>` : ''}
          </div>
        </div>
        <div class="comment-text">${escapeHtml(c.content)}</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

window.deleteComment = async function(commentId, postId) {
  if (!confirm('Are you sure you want to delete this comment?')) return;
  try {
    await apiFetch(`/api/comments/${commentId}`, { method: 'DELETE' });
    showToast('Comment deleted.', 'success');
    renderPost({ id: postId });
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// --- VIEW: WRITER PROFILES ---
async function renderProfile({ name }) {
  const root = document.getElementById('app-root');
  root.innerHTML = `<div class="container"><div class="loader-container"><div class="spinner"></div></div></div>`;

  if (!state.user) {
    showToast('Login required to access profiles.', 'warning');
    window.location.hash = '#/login';
    return;
  }

  try {
    const data = await apiFetch(`/api/profiles/${name}`);
    const profile = data.profile;
    const posts = data.posts;

    const isSelf = state.user.pen_name.toLowerCase() === profile.pen_name.toLowerCase();
    const largeSeal = generateInkSeal(profile.pen_name);

    root.innerHTML = `
      <div class="container">
        <div class="profile-hero card">
          <div style="margin-bottom: 12px; display:flex; justify-content:center;">${largeSeal}</div>
          <h1 style="font-size:28px;">${profile.pen_name}</h1>
          <p style="color: var(--muted); font-family: 'IBM Plex Mono', monospace; font-size: 11px; margin-top:4px;">Joined ${profile.join_date}</p>
          <p style="max-width: 600px; margin: 18px auto; font-style: italic; font-family: 'Fraunces', serif; font-size: 17px; color: var(--ink)">"${profile.bio}"</p>
          
          <div class="profile-stats-grid">
            <div class="profile-stat-box">
              <div class="profile-stat-num">${profile.post_count}</div>
              <div class="profile-stat-lbl">Writings</div>
            </div>
            <div class="profile-stat-box">
              <div class="profile-stat-num">${profile.total_likes}</div>
              <div class="profile-stat-lbl">Likes Rec.</div>
            </div>
            <div class="profile-stat-box">
              <div class="profile-stat-num">${profile.total_comments}</div>
              <div class="profile-stat-lbl">Comments</div>
            </div>
            <div class="profile-stat-box">
              <div class="profile-stat-num">0</div>
              <div class="profile-stat-lbl">Followers</div>
            </div>
          </div>

          ${!isSelf ? `
            <button class="btn btn-secondary btn-sm" id="block-user-btn" style="margin-top: 12px;">
              🔇 Silent Block User
            </button>
          ` : `
            <div class="form-group" style="max-width: 400px; margin: 2rem auto; text-align: left;">
              <hr style="border: 0; border-top: 1px solid var(--line); margin-bottom: 20px;" />
              <h3 style="margin-bottom: 12px; font-size:16px;">Account Settings</h3>
              <form id="update-age-form">
                <div class="form-group">
                  <label for="profile-age-select">Update Age Bracket</label>
                  <select id="profile-age-select">
                    <option value="under_18" ${state.user.age_bracket === 'under_18' ? 'selected' : ''}>Under 18</option>
                    <option value="18_25" ${state.user.age_bracket === '18_25' ? 'selected' : ''}>18–25</option>
                    <option value="26_35" ${state.user.age_bracket === '26_35' ? 'selected' : ''}>26–35</option>
                    <option value="36_50" ${state.user.age_bracket === '36_50' ? 'selected' : ''}>36–50</option>
                    <option value="50_plus" ${state.user.age_bracket === '50_plus' ? 'selected' : ''}>50+</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="profile-age-password">Enter Password to Confirm Change</label>
                  <input type="password" id="profile-age-password" required placeholder="Verify account password" />
                </div>
                <button type="submit" class="btn btn-primary btn-sm">Re-Certify Age</button>
              </form>
            </div>
          `}
        </div>

        <div class="label" style="margin-top:30px;">Writings by ${profile.pen_name}</div>
        <div id="profile-writings-list" style="margin-top: 14px;">
          <!-- Injected writings -->
        </div>
      </div>
    `;

    renderFeedList('profile-writings-list', posts, false);

    if (!isSelf) {
      document.getElementById('block-user-btn').addEventListener('click', async () => {
        if (confirm(`Do you want to silently block ${profile.pen_name}? They will not be notified and cannot comment or like your posts.`)) {
          try {
            await apiFetch('/api/blocks', {
              method: 'POST',
              body: JSON.stringify({ blocked_pen_name: profile.pen_name })
            });
            showToast(`User blocked.`, 'success');
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
      });
    } else {
      document.getElementById('update-age-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const age_bracket = document.getElementById('profile-age-select').value;
        const password = document.getElementById('profile-age-password').value;

        try {
          const res = await apiFetch('/api/auth/age', {
            method: 'PUT',
            body: JSON.stringify({ age_bracket, password })
          });
          state.user.age_bracket = res.age_bracket;
          showToast('Age bracket successfully re-certified.', 'success');
          renderProfile({ name });
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

  } catch (err) {
    root.innerHTML = `
      <div class="container text-center" style="padding-top: 5rem;">
        <h2 style="color: var(--rose)">Profile Loading Failed</h2>
        <p>${err.message}</p>
        <a href="#/" class="btn btn-secondary btn-sm" style="margin-top: 1rem;">Back Home</a>
      </div>
    `;
  }
}

// --- VIEW: SHOUTOUT WALL ---
async function renderWall() {
  const root = document.getElementById('app-root');
  root.innerHTML = `
    <div class="container">
      <div class="wall-layout">
        <h1 class="text-center" style="margin-bottom:8px;">The Confession Wall</h1>
        <p class="text-center" style="color: var(--muted); font-size:13.5px; margin-bottom: 30px;">
          Fire-and-forget short posts. No comments. Stricter harassment filters. Report threshold: 3 flags.
        </p>

        ${state.user ? `
          <div class="card wall-form-card">
            <h3 style="font-size:16px; margin-bottom:10px;">Write on the Wall</h3>
            <form id="wall-post-form" style="margin-top: 1rem;">
              <div class="form-group">
                <textarea id="wall-content-input" max-length="500" placeholder="Post a short shoutout or secret... (Limit: 500 characters)" required></textarea>
                <div class="char-counter" id="wall-char-counter">0 / 500</div>
              </div>
              <button type="submit" class="btn btn-primary btn-block">Post to Wall</button>
            </form>
          </div>
        ` : `
          <div class="card text-center" style="padding: 20px;">
            <p style="font-size:13.5px; margin:0;">You must be <a href="#/login">logged in</a> to post on the Wall.</p>
          </div>
        `}

        <div class="wall-feed" id="wall-feed-container">
          <div class="loader-container"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
  `;

  try {
    const wallPosts = await apiFetch('/api/wall');
    renderWallList(wallPosts);
  } catch (err) {
    showToast(err.message, 'error');
  }

  if (state.user) {
    const textarea = document.getElementById('wall-content-input');
    const counter = document.getElementById('wall-char-counter');
    
    textarea.addEventListener('input', () => {
      const len = textarea.value.length;
      counter.innerText = `${len} / 500`;
      if (len >= 450) {
        counter.className = 'char-counter limit-near';
      } else if (len > 500) {
        counter.className = 'char-counter limit-exceeded';
      } else {
        counter.className = 'char-counter';
      }
    });

    document.getElementById('wall-post-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = textarea.value;
      try {
        await apiFetch('/api/wall', {
          method: 'POST',
          body: JSON.stringify({ content })
        });
        showToast('Confession posted successfully!', 'success');
        renderWall();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }
}

function renderWallList(posts) {
  const container = document.getElementById('wall-feed-container');
  if (posts.length === 0) {
    container.innerHTML = `<p class="text-center" style="color: var(--muted); font-style: italic; font-size:13px;">The Wall is empty. Be the first to post.</p>`;
    return;
  }

  let html = '';
  posts.forEach(p => {
    const inkSeal = generateInkSeal(p.author_name);

    html += `
      <div class="card wall-card">
        <div class="wall-text">${escapeHtml(p.content)}</div>
        <div class="wall-footer">
          <div style="display:inline-flex; align-items:center; gap:8px">
            ${inkSeal}
            <span>By ${p.author_name} • ${formatDate(p.created_at)}</span>
          </div>
          ${state.user ? `<button class="comment-delete-btn" style="color: var(--muted)" onclick="showReportModal('wall_post', '${p.id}')">Report</button>` : ''}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// --- VIEW: WRITING STUDIO (PUBLISH) ---
function renderPublish() {
  if (!state.user) {
    showToast('Access denied: Writer login required.', 'warning');
    window.location.hash = '#/login';
    return;
  }

  if (!state.currentDraftId) {
    state.currentDraftId = 'draft_' + Math.random().toString(36).substr(2, 9);
  }

  const root = document.getElementById('app-root');
  root.innerHTML = `
    <div class="container" style="max-width: 1100px;">
      <div class="feed-header">
        <h1 style="font-size:28px;">Writing Studio</h1>
        <div id="save-status-indicator" class="autosave-status">Draft initialized. Autosave active.</div>
      </div>
      
      <!-- Mobile Layout Toggle Tabs (Hidden on PC, visible on mobile) -->
      <div class="editor-mobile-toggle">
        <button class="btn btn-sm active-tab" id="btn-edit-mode">Write</button>
        <button class="btn btn-sm" id="btn-preview-mode">Preview</button>
      </div>
      
      <div class="editor-layout">
        <!-- Editor Left Pane -->
        <div class="editor-pane-left" id="editor-left-pane">
          <div class="editor-toolbar">
            <button class="editor-tool-btn" id="tool-bold"><b>B</b></button>
            <button class="editor-tool-btn" id="tool-italic"><i>I</i></button>
            <button class="editor-tool-btn" id="tool-h2">H2</button>
            <button class="editor-tool-btn" id="tool-quote">”</button>
            <button class="editor-tool-btn" id="tool-code">&lt;&gt;</button>
          </div>
          
          <div class="form-group" style="flex-grow: 1; display: flex; flex-direction: column;">
            <textarea id="editor-textarea" class="editor-textarea" placeholder="Start your story here using Markdown syntax..."></textarea>
          </div>
          
          <div class="form-group">
            <label for="post-rating-select">Content Age Rating (Mandatory)</label>
            <select id="post-rating-select" required>
              <option value="" disabled selected>-- Select Rating --</option>
              <option value="general">General (Suitable for all ages)</option>
              <option value="mature">Mature (13+ Recommended)</option>
              <option value="18+">18+ (Explicit / Graphic Gated)</option>
            </select>
          </div>

          <div class="form-group">
            <label for="post-tags-input">Tags (comma-separated)</label>
            <input type="text" id="post-tags-input" placeholder="memoir, poetry, fiction" />
          </div>

          <div style="display: flex; gap: 1rem;">
            <button class="btn btn-secondary btn-block" id="discard-draft-btn">Discard Draft</button>
            <button class="btn btn-primary btn-block" id="publish-story-btn">Publish Story</button>
          </div>
        </div>

        <!-- Preview Right Pane -->
        <div class="editor-pane-right" id="editor-right-pane">
          <h3 style="border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-bottom: 14px; font-size:15px; font-family:'Fraunces', serif;">Live Preview</h3>
          <div id="live-preview-box" class="post-detail-content" style="margin: 0;"></div>
        </div>
      </div>
    </div>
  `;

  const textarea = document.getElementById('editor-textarea');
  const preview = document.getElementById('live-preview-box');
  const ratingSelect = document.getElementById('post-rating-select');
  const tagsInput = document.getElementById('post-tags-input');
  const saveIndicator = document.getElementById('save-status-indicator');

  // Mobile layout toggling
  const editTabBtn = document.getElementById('btn-edit-mode');
  const previewTabBtn = document.getElementById('btn-preview-mode');
  const leftPane = document.getElementById('editor-left-pane');
  const rightPane = document.getElementById('editor-right-pane');

  if (editTabBtn && previewTabBtn && leftPane && rightPane) {
    // Default mobile state: hide preview
    rightPane.classList.add('mobile-hidden');
    
    editTabBtn.addEventListener('click', () => {
      editTabBtn.classList.add('active-tab');
      previewTabBtn.classList.remove('active-tab');
      leftPane.classList.remove('mobile-hidden');
      rightPane.classList.add('mobile-hidden');
    });
    
    previewTabBtn.addEventListener('click', () => {
      previewTabBtn.classList.add('active-tab');
      editTabBtn.classList.remove('active-tab');
      rightPane.classList.remove('mobile-hidden');
      leftPane.classList.add('mobile-hidden');
    });
  }

  const savedLocal = localStorage.getItem(`draft_${state.user.id}`);
  if (savedLocal) {
    try {
      const parsed = JSON.parse(savedLocal);
      textarea.value = parsed.content || '';
      ratingSelect.value = parsed.content_rating || '';
      tagsInput.value = parsed.tags || '';
      preview.innerHTML = markdownToHtml(parsed.content || '');
    } catch (e) {
      console.error('Failed to parse local draft data.');
    }
  }

  textarea.addEventListener('input', () => {
    preview.innerHTML = markdownToHtml(textarea.value);
  });

  setupToolbarButton('tool-bold', '**', '**');
  setupToolbarButton('tool-italic', '*', '*');
  setupToolbarButton('tool-h2', '\n## ', '\n');
  setupToolbarButton('tool-quote', '\n> ', '\n');
  setupToolbarButton('tool-code', '`', '`');

  function setupToolbarButton(btnId, prefix, suffix) {
    document.getElementById(btnId).addEventListener('click', () => {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;
      const selectedText = val.substring(start, end);
      textarea.value = val.substring(0, start) + prefix + selectedText + suffix + val.substring(end);
      textarea.focus();
      textarea.selectionStart = start + prefix.length;
      textarea.selectionEnd = start + prefix.length + selectedText.length;
      preview.innerHTML = markdownToHtml(textarea.value);
    });
  }

  state.autosaveInterval = setInterval(async () => {
    const payload = {
      content: textarea.value,
      content_rating: ratingSelect.value,
      tags: tagsInput.value
    };

    localStorage.setItem(`draft_${state.user.id}`, JSON.stringify(payload));
    
    if (payload.content.trim()) {
      try {
        saveIndicator.innerText = 'Autosaving...';
        await apiFetch(`/api/posts/${state.currentDraftId}/autosave`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        saveIndicator.innerText = `Draft saved to server: ${new Date().toLocaleTimeString()}`;
      } catch (err) {
        saveIndicator.innerText = `Autosave failed: ${err.message}`;
      }
    }
  }, 10000);

  document.getElementById('discard-draft-btn').addEventListener('click', () => {
    if (confirm('Are you sure you want to discard this draft? Your progress will be lost.')) {
      clearInterval(state.autosaveInterval);
      state.autosaveInterval = null;
      localStorage.removeItem(`draft_${state.user.id}`);
      state.currentDraftId = null;
      window.location.hash = '#/';
      showToast('Draft discarded.', 'info');
    }
  });

  document.getElementById('publish-story-btn').addEventListener('click', async () => {
    const content = textarea.value.trim();
    const content_rating = ratingSelect.value;
    const tags = tagsInput.value.trim();

    if (!content) {
      showToast('Story content cannot be empty.', 'warning');
      return;
    }
    if (!content_rating) {
      showToast('Please select a content age rating before publishing.', 'warning');
      return;
    }

    try {
      const res = await apiFetch('/api/posts', {
        method: 'POST',
        body: JSON.stringify({ content, content_rating, tags })
      });

      clearInterval(state.autosaveInterval);
      state.autosaveInterval = null;
      localStorage.removeItem(`draft_${state.user.id}`);
      
      try {
        await apiFetch(`/api/admin/action`, {
          method: 'POST',
          body: JSON.stringify({ target_type: 'post', target_id: state.currentDraftId, action: 'remove' })
        });
      } catch (e) {
        // Draft cleanup silent failure
      }
      
      state.currentDraftId = null;
      showToast('Story published successfully!', 'success');
      window.location.hash = `#/posts/${res.id}`;
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// --- VIEW: LOGIN ---
function renderLogin() {
  const root = document.getElementById('app-root');
  root.innerHTML = `
    <div class="container" style="max-width: 420px; padding-top: 4rem;">
      <div class="card">
        <h1 class="text-center" style="font-size: 26px; margin-bottom:4px;">Log In</h1>
        <p class="text-center" style="color: var(--muted); font-size:13.5px; margin-bottom: 24px;">Enter your pen name credentials</p>
        
        <form id="login-form">
          <div class="form-group">
            <label for="login-username">Pen Name</label>
            <input type="text" id="login-username" placeholder="e.g. MidnightScribbler" required autocomplete="username" />
          </div>
          
          <div class="form-group" style="margin-bottom: 20px;">
            <label for="login-password">Password</label>
            <input type="password" id="login-password" required placeholder="Your password" autocomplete="current-password" />
          </div>
          
          <button type="submit" class="btn btn-primary btn-block">Log In</button>
        </form>

        <p class="text-center" style="margin-top: 18px; font-size: 13px;">
          Don't have a pen name? <a href="#/signup">Signup here</a>
        </p>
      </div>
    </div>
  `;

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      state.token = res.token;
      state.user = res.user;
      localStorage.setItem('token', res.token);
      showToast(`Welcome back, ${res.user.pen_name}!`, 'success');
      window.location.hash = '#/';
    } catch (err) {
      showToast(err.error || err.message, 'error');
    }
  });
}

// --- VIEW: SIGNUP ---
function renderSignup() {
  const root = document.getElementById('app-root');
  root.innerHTML = `
    <div class="container" style="max-width: 480px; padding-top: 2rem;">
      <div class="card">
        <h1 class="text-center" style="font-size: 26px; margin-bottom:4px;">Claim Pen Name</h1>
        <p class="text-center" style="color: var(--muted); font-size:13px; margin-bottom: 20px;">Create a fully anonymous account</p>
        
        <div class="warning-box">
          <h4>⚠️ IRREVERSIBLE PASSWORD POLICY</h4>
          <p>Whisper Pages collects absolutely zero personal identification info (no email, no phone). There is <b>no way to recover your account</b> if you forget your password.</p>
        </div>

        <form id="signup-form">
          <div class="form-group">
            <label for="signup-username">Desired Pen Name</label>
            <input type="text" id="signup-username" placeholder="e.g. SolitaryWriter" required autocomplete="username" />
            <div id="username-validation-msg" style="font-size: 11px; margin-top: 4px;"></div>
          </div>
          
          <div class="form-group">
            <label for="signup-password">Password</label>
            <input type="password" id="signup-password" required placeholder="Choose a strong password" autocomplete="new-password" />
            <div class="password-meter-container">
              <div class="password-meter-bar">
                <div class="password-meter-fill" id="strength-meter-fill"></div>
              </div>
              <div class="password-meter-text" id="strength-meter-text">Strength: Weak (Requires 10+ characters, letters, numbers, and a symbol)</div>
            </div>
          </div>

          <div class="form-group">
            <label for="signup-age">Self-Declared Age Bracket</label>
            <select id="signup-age" required>
              <option value="" disabled selected>-- Select Age Bracket --</option>
              <option value="under_18">Under 18</option>
              <option value="18_25">18–25</option>
              <option value="26_35">26–35</option>
              <option value="36_50">36–50</option>
              <option value="50_plus">50+</option>
            </select>
            <p style="color: var(--muted); font-size: 11px; margin-top: 4px;">Used solely for age certification gating defaults.</p>
          </div>

          <div class="form-group" style="margin-top: 20px;">
            <label class="form-group-row" style="align-items: flex-start;">
              <input type="checkbox" id="signup-ack-recovery" required style="margin-top: 4px;" />
              <span style="font-size: 13px; line-height: 1.3;">I acknowledge that there is no recovery mechanism for this account, and I will write down my credentials safely.</span>
            </label>
          </div>

          <button type="submit" class="btn btn-primary btn-block" id="signup-submit-btn">Claim Pen Name</button>
        </form>

        <p class="text-center" style="margin-top: 18px; font-size: 13px;">
          Already have a pen name? <a href="#/login">Login here</a>
        </p>
      </div>
    </div>
  `;

  const passwordInput = document.getElementById('signup-password');
  const meterFill = document.getElementById('strength-meter-fill');
  const meterText = document.getElementById('strength-meter-text');
  const ackCheck = document.getElementById('signup-ack-recovery');

  passwordInput.addEventListener('input', debounce(async () => {
    const password = passwordInput.value;
    if (!password) {
      meterFill.className = 'password-meter-fill';
      meterFill.style.width = '0';
      meterText.innerText = 'Strength: Empty';
      meterText.className = 'password-meter-text';
      return;
    }

    try {
      const res = await apiFetch('/api/auth/check-password-strength', {
        method: 'POST',
        body: JSON.stringify({ password })
      });

      if (res.blocklisted) {
        meterFill.className = 'password-meter-fill';
        meterFill.style.width = '100%';
        meterFill.style.backgroundColor = 'var(--rose)';
        meterText.innerText = '⚠️ Blocklisted: Too common / breached password';
        meterText.className = 'password-meter-text blocklisted';
      } else {
        meterFill.className = `password-meter-fill ${res.score}`;
        meterText.className = 'password-meter-text';
        if (res.score === 'weak') {
          meterText.innerText = 'Strength: Weak (Must mix letter, digit, symbol)';
        } else if (res.score === 'medium') {
          meterText.innerText = 'Strength: Medium (Adequate)';
        } else {
          meterText.innerText = 'Strength: Strong (Secure)';
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, 300));

  ackCheck.addEventListener('change', () => {
    // Deprecated state handler
  });

  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('signup-username').value.trim();
    const password = passwordInput.value;
    const age_bracket = document.getElementById('signup-age').value;
    const isAcked = ackCheck.checked;

    if (!isAcked) {
      alert('⚠️ Acknowledgment Required:\nYou must check the checkbox acknowledging that there is no password recovery option to proceed.');
      return;
    }

    const meetsComplexity = password.length >= 10 && /[a-zA-Z]/.test(password) && /\d/.test(password) && /[!@#$%^&*()_+\-=\[\]{};':",\\|.<>\/?~`]/.test(password);
    const isBlocklisted = meterText.classList.contains('blocklisted');

    if (isBlocklisted) {
      alert('⚠️ Password Blocked:\nThis password is too common or has been flagged in global data breaches. Please choose a different, more unique password.');
      return;
    }

    if (!meetsComplexity) {
      alert('⚠️ Weak Password:\nYour password is not secure enough. To secure your anonymous account, it must:\n- Be at least 10 characters long\n- Contain at least one letter\n- Contain at least one number\n- Contain at least one symbol');
      return;
    }

    if (!age_bracket) {
      alert('⚠️ Age Bracket Required:\nPlease select your self-declared age bracket to complete signup.');
      return;
    }

    try {
      const res = await apiFetch('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ username, password, age_bracket })
      });
      state.token = res.token;
      state.user = res.user;
      localStorage.setItem('token', res.token);
      showToast(`Welcome! Your Pen Name "${res.user.pen_name}" is claimed.`, 'success');
      window.location.hash = '#/';
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// --- VIEW: ADMIN CONTROL PANEL ---
async function renderAdmin() {
  if (!state.user || state.user.role !== 'admin') {
    showToast('Unauthorized: Admin access required.', 'error');
    window.location.hash = '#/';
    return;
  }

  const root = document.getElementById('app-root');
  root.innerHTML = `
    <div class="container" style="max-width: 1000px;">
      <h1 style="font-size:26px; margin-bottom:4px;">Admin Control Center</h1>
      <p style="color: var(--muted); font-size:13px; margin-bottom: 20px;">Moderation queue, IP audit lookups, and platform lifecycle controls.</p>
      
      <div class="admin-tab-bar">
        <div class="admin-tab active" id="tab-moderation">Reports Queue</div>
        <div class="admin-tab" id="tab-lookup">IP / User Lookup</div>
        <div class="admin-tab" id="tab-audit">Admin Audit Log</div>
        <div class="admin-tab" id="tab-feedback">Feedback Widget Logs</div>
        <div class="admin-tab" id="tab-lifecycle">Lifecycle / 300-Day</div>
      </div>

      <div class="admin-content-pane" id="admin-pane">
        <!-- Dynamic Admin views injected here -->
      </div>
    </div>
  `;

  const tabs = ['moderation', 'lookup', 'audit', 'feedback', 'lifecycle'];
  tabs.forEach(tab => {
    document.getElementById(`tab-${tab}`).addEventListener('click', (e) => {
      tabs.forEach(t => document.getElementById(`tab-${t}`).classList.remove('active'));
      e.target.classList.add('active');
      loadAdminTab(tab);
    });
  });

  loadAdminTab('moderation');
}

async function loadAdminTab(tab) {
  const pane = document.getElementById('admin-pane');
  pane.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

  try {
    if (tab === 'moderation') {
      const data = await apiFetch('/api/admin/reports');
      let reports = data.reports;
      
      if (reports.length === 0) {
        pane.innerHTML = '<p style="color: var(--muted); font-style: italic; font-size:13px;">No pending reports.</p>';
        return;
      }

      let html = `
        <table class="admin-table">
          <thead>
            <tr>
              <th>Target</th>
              <th>Content Snippet</th>
              <th>Reporter</th>
              <th>Reason</th>
              <th>Report Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
      `;

      reports.forEach(r => {
        const details = r.target_details || { content: '[Deleted/Missing]', status: 'removed', author_name: 'Unknown' };
        const displaySnippet = details.content.length > 80 ? details.content.substring(0, 80) + '...' : details.content;
        
        html += `
          <tr>
            <td>
              <b>${r.target_type.toUpperCase()}</b><br/>
              <span style="font-size:11px; color: var(--muted); font-family: 'IBM Plex Mono', monospace">Author: ${details.author_name}</span>
            </td>
            <td>
              <div style="font-family: 'Fraunces', serif; font-size:14px; color: var(--ink)">"${escapeHtml(displaySnippet)}"</div>
              <span class="post-rating ${details.status === 'hidden' ? '18plus' : 'general'}" style="font-size:9.5px; padding: 1px 4px;">${details.status}</span>
            </td>
            <td>${r.reporter_name}</td>
            <td>${escapeHtml(r.reason)}</td>
            <td>${r.status}</td>
            <td>
              <div style="display:flex; gap: 6px;">
                ${details.status !== 'hidden' ? `<button class="btn btn-secondary btn-sm" onclick="adminAction('${r.target_type}', '${r.target_id}', 'hide', '${r.id}')">Hide</button>` : ''}
                <button class="btn btn-primary btn-sm" onclick="adminAction('${r.target_type}', '${r.target_id}', 'restore', '${r.id}')">Restore</button>
                <button class="btn btn-danger btn-sm" onclick="adminAction('${r.target_type}', '${r.target_id}', 'remove', '${r.id}')">Remove</button>
              </div>
            </td>
          </tr>
        `;
      });

      html += '</tbody></table>';
      pane.innerHTML = html;

    } else if (tab === 'lookup') {
      pane.innerHTML = `
        <div class="card" style="max-width: 500px; margin: 0 auto;">
          <h3 style="font-size:16px; margin-bottom:6px; font-family:'Fraunces', serif;">Sensitive Data Lookup</h3>
          <p style="color: var(--muted); font-size: 13px;">Lookup IP addresses and account parameters. Requires secondary 2FA security key authorization.</p>
          <hr style="border:0; border-top:1px solid var(--line); margin: 12px 0;"/>
          
          <form id="admin-lookup-form">
            <div class="form-group">
              <label for="lookup-pen-name">Target Pen Name</label>
              <input type="text" id="lookup-pen-name" required placeholder="e.g. SilentDreamer" />
            </div>
            <div class="form-group">
              <label for="lookup-2fa-token">Admin 2FA Security Key</label>
              <input type="password" id="lookup-2fa-token" required placeholder="Enter 6-digit key (Default: 123456)" />
            </div>
            <button type="submit" class="btn btn-primary btn-block">Authorize Lookup</button>
          </form>

          <div id="lookup-result-box" style="margin-top: 14px;"></div>
        </div>
      `;

      document.getElementById('admin-lookup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pen_name = document.getElementById('lookup-pen-name').value;
        const two_factor_token = document.getElementById('lookup-2fa-token').value;
        const resBox = document.getElementById('lookup-result-box');
        resBox.innerHTML = '<div class="spinner"></div>';

        try {
          const res = await apiFetch('/api/admin/user-lookup', {
            method: 'POST',
            body: JSON.stringify({ pen_name, two_factor_token })
          });
          
          resBox.innerHTML = `
            <div class="warning-box">
              <h4 style="color: var(--accent-d)">✓ Lookup Authorized & Audit Logged</h4>
              <p style="font-family: 'IBM Plex Mono', monospace; font-size: 11px; margin-top: 8px; color: var(--ink); line-height: 1.6;">
                ID: ${res.user.id}<br/>
                Pen Name: ${res.user.pen_name}<br/>
                Age Bracket: ${res.user.age_bracket}<br/>
                IP Address: ${res.user.ip_address}<br/>
                Created At: ${res.user.created_at}<br/>
                Last Active: ${res.user.last_active_at}<br/>
                Status: ${res.user.status}
              </p>
            </div>
          `;
        } catch (err) {
          resBox.innerHTML = `<p style="color: var(--rose); font-weight:600; font-size:13px;">❌ ${err.message}</p>`;
        }
      });

    } else if (tab === 'audit') {
      const data = await apiFetch('/api/admin/audit-logs');
      let logs = data.logs;

      if (logs.length === 0) {
        pane.innerHTML = '<p style="color: var(--muted); font-style: italic; font-size:13px;">No audit log records found.</p>';
        return;
      }

      let html = `
        <table class="admin-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action Code</th>
              <th>Admin Actor</th>
              <th>Target ID</th>
              <th>Context Metadata</th>
            </tr>
          </thead>
          <tbody>
      `;

      logs.forEach(l => {
        html += `
          <tr>
            <td style="font-family: 'IBM Plex Mono', monospace">${formatDate(l.created_at)}</td>
            <td><code style="color: var(--accent-d); font-family: 'IBM Plex Mono', monospace">${l.action_type}</code></td>
            <td>${l.admin_id}</td>
            <td style="font-family: 'IBM Plex Mono', monospace"><code>${l.target_id}</code></td>
            <td><small>${l.metadata || ''}</small></td>
          </tr>
        `;
      });

      html += '</tbody></table>';
      pane.innerHTML = html;

    } else if (tab === 'feedback') {
      const data = await apiFetch('/api/admin/feedback');
      let feed = data.feedbackItems;

      if (feed.length === 0) {
        pane.innerHTML = '<p style="color: var(--muted); font-style: italic; font-size:13px;">No feedback received yet.</p>';
        return;
      }

      let html = `
        <table class="admin-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Category</th>
              <th>Feedback Message</th>
              <th>Page Route</th>
            </tr>
          </thead>
          <tbody>
      `;

      feed.forEach(f => {
        html += `
          <tr>
            <td style="font-family: 'IBM Plex Mono', monospace">${formatDate(f.created_at)}</td>
            <td>
              <span class="tag" style="background:#F2E4E9">${f.category}</span>
            </td>
            <td>${escapeHtml(f.content)}</td>
            <td style="font-family: 'IBM Plex Mono', monospace"><code>${f.page_context || '/'}</code></td>
          </tr>
        `;
      });

      html += '</tbody></table>';
      pane.innerHTML = html;

    } else if (tab === 'lifecycle') {
      pane.innerHTML = `
        <div class="card" style="max-width: 500px; margin: 0 auto;">
          <h3 style="font-size:16px; margin-bottom:6px; font-family:'Fraunces', serif;">Simulate Account Inactivity Check</h3>
          <p style="color: var(--muted); font-size: 13px;">Force age a user profile's last-active timestamp to simulate warnings (250+ days) and hard deletions (300+ days). This will test database cascades.</p>
          <hr style="border:0; border-top:1px solid var(--line); margin: 12px 0;"/>
          
          <form id="admin-lifecycle-form">
            <div class="form-group">
              <label for="life-pen-name">Target Pen Name to Age</label>
              <input type="text" id="life-pen-name" required placeholder="e.g. MidnightScribbler" />
            </div>
            <div class="form-group">
              <label for="life-age-days">Aged By (Days)</label>
              <input type="number" id="life-age-days" required value="300" min="1" max="1000" />
            </div>
            <button type="submit" class="btn btn-primary btn-block">Execute simulation</button>
          </form>

          <div id="lifecycle-result-box" style="margin-top: 14px;"></div>
        </div>
      `;

      document.getElementById('admin-lifecycle-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pen_name = document.getElementById('life-pen-name').value;
        const age_days = document.getElementById('life-age-days').value;
        const resBox = document.getElementById('lifecycle-result-box');
        resBox.innerHTML = '<div class="spinner"></div>';

        try {
          const res = await apiFetch('/api/admin/simulate-inactivity', {
            method: 'POST',
            body: JSON.stringify({ pen_name, age_days })
          });
          
          let deletedMsg = '';
          if (res.deleted && res.deleted.length > 0) {
            deletedMsg = `<br/><span style="color: var(--rose); font-weight:700;">Account deleted: [${res.deleted.join(', ')}] and cascading records removed.</span>`;
          } else {
            deletedMsg = `<br/>Account not deleted (below 300 days inactivity limit). Banner warning active if days >= 250.`;
          }

          resBox.innerHTML = `
            <div class="warning-box" style="background:#FAF8F5;">
              <h4>Simulation Complete</h4>
              <p style="font-size:12.5px; color: var(--ink);">
                ${res.message}
                ${deletedMsg}
              </p>
            </div>
          `;
        } catch (err) {
          resBox.innerHTML = `<p style="color: var(--rose); font-weight:600; font-size:13px;">❌ Error: ${err.message}</p>`;
        }
      });
    }
  } catch (err) {
    pane.innerHTML = `<p style="color: var(--rose)" class="text-center">${err.message}</p>`;
  }
}

window.adminAction = async function(target_type, target_id, action, report_id) {
  if (!confirm(`Are you sure you want to perform moderation action "${action}" on this ${target_type}?`)) return;
  try {
    await apiFetch('/api/admin/action', {
      method: 'POST',
      body: JSON.stringify({ target_type, target_id, action, report_id })
    });
    showToast(`Moderation action completed: ${action}`, 'success');
    loadAdminTab('moderation');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// --- VIEW: REPORTING CONTENT MODAL DIALOG ---
window.showReportModal = function(target_type, target_id) {
  const oldModal = document.getElementById('reporting-dialog-modal');
  if (oldModal) oldModal.remove();

  const modal = document.createElement('div');
  modal.id = 'reporting-dialog-modal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-header">
        <h2 style="font-family:'Fraunces', serif;">Report Content</h2>
        <button class="close-btn" onclick="closeReportModal()">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size: 13.5px; margin-bottom: 12px;">Help us keep Whisper Pages safe. Please select a reason code for reporting this ${target_type}:</p>
        <form id="reporting-dialog-form">
          <div class="form-group">
            <label for="report-reason-select">Reason Code</label>
            <select id="report-reason-select" required>
              <option value="" disabled selected>-- Select Reason --</option>
              <option value="harassment">Harassment / Intimidation</option>
              <option value="pii">Personally Identifying Information (PII)</option>
              <option value="inappropriate_rating">Incorrect Content Rating (Under-tagged)</option>
              <option value="spam">Spam / Bot content</option>
              <option value="prohibited">Prohibited Content (Exploitative, extreme violence)</option>
            </select>
          </div>
          <button type="submit" class="btn btn-danger btn-block">Submit Report</button>
        </form>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('reporting-dialog-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const reason = document.getElementById('report-reason-select').value;
    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({ target_type, target_id, reason })
      });
      showToast('Thank you. Content reported for moderation.', 'success');
      closeReportModal();
      router();
    } catch (err) {
      showToast(err.message, 'error');
      closeReportModal();
    }
  });
};

window.closeReportModal = function() {
  const modal = document.getElementById('reporting-dialog-modal');
  if (modal) modal.remove();
};

// --- VIEW: COMMUNITY GUIDELINES MODAL DIALOG ---
function initGuidelinesModal() {
  const modal = document.getElementById('guidelines-modal');
  const closeBtn = document.getElementById('close-guidelines-btn');
  const ackBtn = document.getElementById('acknowledge-guidelines-btn');

  function hide() {
    modal.classList.add('hidden');
  }

  closeBtn.addEventListener('click', hide);
  ackBtn.addEventListener('click', hide);
}

window.showGuidelines = function() {
  const modal = document.getElementById('guidelines-modal');
  if (modal) modal.classList.remove('hidden');
};

// --- VIEW: FEEDBACK WIDGET CONTROLLER ---
function initFeedbackWidget() {
  const trigger = document.getElementById('feedback-trigger-btn');
  const panel = document.getElementById('feedback-panel');
  const closeBtn = document.getElementById('feedback-panel-close');
  const form = document.getElementById('feedback-form-element');
  const successMsg = document.getElementById('feedback-success-msg');
  const textarea = document.getElementById('feedback-content-input');

  trigger.addEventListener('click', () => {
    panel.classList.toggle('hidden');
    successMsg.classList.add('hidden');
    form.classList.remove('hidden');
    textarea.value = '';
  });

  closeBtn.addEventListener('click', () => {
    panel.classList.add('hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const category = form.elements['feedback-category'].value;
    const content = textarea.value;
    const page_context = window.location.hash || '/';

    try {
      await apiFetch('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({ category, content, page_context })
      });
      form.classList.add('hidden');
      successMsg.classList.remove('hidden');
      setTimeout(() => {
        panel.classList.add('hidden');
      }, 3000);
    } catch (err) {
      showToast('Failed to submit feedback.', 'error');
    }
  });
}

// --- MARKDOWN TO HTML COMPILER ENGINE ---
function markdownToHtml(md) {
  if (!md) return '';
  let html = md;

  html = escapeHtml(html);

  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');

  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  html = html.replace(/\n\n/g, '</p><p>');

  html = html.replace(/\n/g, '<br/>');

  return `<p>${html}</p>`;
}

// --- GENERAL UTILITIES ---
function formatDate(isoStr) {
  const date = new Date(isoStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }) + ' ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Launch APP
initApp();
