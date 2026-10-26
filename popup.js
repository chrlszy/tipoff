const ESPN_SCOREBOARD_API = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const ESPN_TEAMS_API = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams";
const ESPN_STANDINGS_API = "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings";
const PITSPORT_URL = "https://pitsport.st/competitions/100046?tab=programs";
const DEFAULT_TEAMS = ["LAL", "PHI"];

const matchesBtn = document.getElementById("tab-matches-btn");
const standingsBtn = document.getElementById("tab-standings-btn");
const pickerBtn = document.getElementById("tab-picker-btn");

const matchesView = document.getElementById("view-matches");
const standingsView = document.getElementById("view-standings");
const pickerView = document.getElementById("view-picker");

const filterTrackedBtn = document.getElementById("filter-tracked-btn");
const filterAllBtn = document.getElementById("filter-all-btn");
const dateStrip = document.getElementById("date-strip");
const livePulse = document.getElementById("live-pulse");
const footerPitsportBtn = document.getElementById("footer-pitsport-btn");

let cachedTeamsList = [];
let showAllGames = false;
let selectedDateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");

// Link button handler
if (footerPitsportBtn) {
  footerPitsportBtn.onclick = () => {
    chrome.tabs.create({ url: PITSPORT_URL });
  };
}

// Tab navigation
matchesBtn.onclick = () => {
  setView("matches");
  loadGames(selectedDateStr);
};

standingsBtn.onclick = () => {
  setView("standings");
  loadStandings();
};

pickerBtn.onclick = () => {
  setView("picker");
  loadTeamPicker();
};

function setView(view) {
  matchesView.classList.toggle("view-hidden", view !== "matches");
  standingsView.classList.toggle("view-hidden", view !== "standings");
  pickerView.classList.toggle("view-hidden", view !== "picker");

  matchesBtn.classList.toggle("active", view === "matches");
  standingsBtn.classList.toggle("active", view === "standings");
  pickerBtn.classList.toggle("active", view === "picker");
}

filterTrackedBtn.onclick = () => {
  showAllGames = false;
  filterTrackedBtn.classList.add("active");
  filterAllBtn.classList.remove("active");
  loadGames(selectedDateStr);
};

filterAllBtn.onclick = () => {
  showAllGames = true;
  filterAllBtn.classList.add("active");
  filterTrackedBtn.classList.remove("active");
  loadGames(selectedDateStr);
};

function buildDateCarousel() {
  dateStrip.innerHTML = "";
  const base = new Date();

  for (let i = -1; i <= 3; i++) {
    const d = new Date();
    d.setDate(base.getDate() + i);

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const key = `${yyyy}${mm}${dd}`;

    const pill = document.createElement("button");
    pill.className = `date-pill ${i === 0 ? "active" : ""}`;
    pill.dataset.date = key;

    const dayNum = d.getDate();
    const dayName = i === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" });

    pill.innerHTML = `
      <span class="day-num">${dayNum}</span>
      <span class="day-name">${dayName}</span>
    `;

    pill.onclick = () => {
      document.querySelectorAll(".date-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      selectedDateStr = key;
      loadGames(selectedDateStr);
    };

    dateStrip.appendChild(pill);
  }
}

// 1. Matches loader
async function loadGames(dateParam) {
  const container = document.getElementById("games-container");
  const { selectedTeams = DEFAULT_TEAMS, bellAlerts = [] } = await chrome.storage.local.get([
    "selectedTeams",
    "bellAlerts"
  ]);

  try {
    const res = await fetch(`${ESPN_SCOREBOARD_API}?dates=${dateParam}`);
    const data = await res.json();
    const events = data.events || [];

    const games = showAllGames
      ? events
      : events.filter((e) =>
          e.competitions?.[0]?.competitors.some((c) => selectedTeams.includes(c.team?.abbreviation))
        );

    const hasLiveGame = events.some((e) => e.status.type.state === "in");
    livePulse.style.display = hasLiveGame ? "inline-block" : "none";

    if (games.length === 0) {
      container.innerHTML = `<div class="empty-msg">${showAllGames ? "No NBA games scheduled." : "No tracked games today."}</div>`;
      return;
    }

    container.innerHTML = games.map((game) => {
      const comp = game.competitions[0];
      const home = comp.competitors.find((c) => c.homeAway === "home");
      const away = comp.competitors.find((c) => c.homeAway === "away");
      const state = game.status.type.state;
      const detail = game.status.type.detail;
      const broadcast = comp.broadcasts?.[0]?.names?.[0] || "";
      const isBellActive = bellAlerts.includes(game.id);

      const homeLines = home.linescores || [];
      const awayLines = away.linescores || [];

      const leaders = comp.leaders || [];
      const ptsLeader = leaders.find((l) => l.name === "points");
      const leaderText = ptsLeader
        ? `🔥 Top Scorer: ${ptsLeader.leaders?.[0]?.athlete?.displayName} (${ptsLeader.leaders?.[0]?.value} PTS)`
        : "";

      let centerText = "";
      if (state === "in") {
        centerText = `<div class="score-display">${away.score} : ${home.score}</div>
                      <div class="status-sub status-live">● ${detail}</div>`;
      } else if (state === "post") {
        centerText = `<div class="score-display">${away.score} : ${home.score}</div>
                      <div class="status-sub">Final</div>`;
      } else {
        const time = new Date(game.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        centerText = `<div class="score-display" style="font-size:14px;">VS</div>
                      <div class="status-sub">${time}</div>
                      ${broadcast ? `<span class="broadcast-tag">${broadcast}</span>` : ""}
                      <button class="bell-btn ${isBellActive ? "active" : ""}" data-game-id="${game.id}" data-time="${game.date}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="${isBellActive ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
                      </button>`;
      }

      return `
        <div class="matchup-card" data-game-card="${game.id}">
          <div class="card-main">
            <div class="team-col">
              <div class="team-logo-wrap">
                <img src="${away.team.logo}" alt="" onerror="this.style.display='none'"/>
              </div>
              <span class="team-short-name">${away.team.shortDisplayName}</span>
              <span class="team-record">${away.records?.[0]?.summary || ""}</span>
            </div>

            <div class="center-info">
              ${centerText}
            </div>

            <div class="team-col">
              <div class="team-logo-wrap">
                <img src="${home.team.logo}" alt="" onerror="this.style.display='none'"/>
              </div>
              <span class="team-short-name">${home.team.shortDisplayName}</span>
              <span class="team-record">${home.records?.[0]?.summary || ""}</span>
            </div>
          </div>

          <div class="card-drawer" id="drawer-${game.id}">
            ${
              awayLines.length > 0
                ? `
              <table class="line-score-table">
                <tr><th></th>${awayLines.map((_, i) => `<th>Q${i + 1}</th>`).join("")}<th>T</th></tr>
                <tr><td>${away.team.abbreviation}</td>${awayLines.map((l) => `<td>${l.value}</td>`).join("")}<td>${away.score}</td></tr>
                <tr><td>${home.team.abbreviation}</td>${homeLines.map((l) => `<td>${l.value}</td>`).join("")}<td>${home.score}</td></tr>
              </table>`
                : ""
            }
            ${leaderText ? `<div class="leader-row">${leaderText}</div>` : ""}
            <div class="leader-row" style="color: #64748b; font-size: 9.5px;">
              <span>Venue: ${comp.venue?.fullName || "NBA Arena"}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");

    attachCardInteractions();
  } catch (err) {
    container.innerHTML = `<div class="empty-msg">Unable to load games.</div>`;
  }
}

function attachCardInteractions() {
  document.querySelectorAll(".matchup-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".bell-btn")) return;
      const id = card.dataset.gameCard;
      const drawer = document.getElementById(`drawer-${id}`);
      if (drawer) drawer.classList.toggle("open");
    });
  });

  document.querySelectorAll(".bell-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const gameId = btn.dataset.gameId;
      const gameTime = new Date(btn.dataset.time).getTime();
      let { bellAlerts = [] } = await chrome.storage.local.get("bellAlerts");

      if (bellAlerts.includes(gameId)) {
        bellAlerts = bellAlerts.filter((id) => id !== gameId);
        btn.classList.remove("active");
        chrome.alarms.clear(`alert-${gameId}`);
      } else {
        bellAlerts.push(gameId);
        btn.classList.add("active");
        const alertTimestamp = Math.max(Date.now() + 1000, gameTime - 15 * 60 * 1000);
        chrome.alarms.create(`alert-${gameId}`, { when: alertTimestamp });
      }

      await chrome.storage.local.set({ bellAlerts });
    });
  });
}

// 2. Corrected Standings Loader (Properly sorted from 1st to 8th)
async function loadStandings() {
  const container = document.getElementById("standings-container");
  const { selectedTeams = DEFAULT_TEAMS } = await chrome.storage.local.get("selectedTeams");

  try {
    const res = await fetch(ESPN_STANDINGS_API);
    const data = await res.json();
    const conferences = data.children || [];

    container.innerHTML = conferences.map((conf) => {
      const teams = (conf.standings?.entries || []).map((entry) => {
        const stats = entry.stats || [];
        const wins = stats.find((s) => s.name === "wins")?.value || 0;
        const losses = stats.find((s) => s.name === "losses")?.value || 0;
        const winPercent = stats.find((s) => s.name === "winPercent")?.value || 0;
        const pctDisplay = stats.find((s) => s.name === "winPercent")?.displayValue || ".000";

        return {
          displayName: entry.team?.displayName || "",
          abbr: entry.team?.abbreviation || "",
          logo: entry.team?.logos?.[0]?.href || "",
          wins,
          losses,
          winPercent,
          pctDisplay
        };
      });

      // Sort: Highest Win Percentage first; break ties with most wins
      teams.sort((a, b) => b.winPercent - a.winPercent || b.wins - a.wins);

      const top8 = teams.slice(0, 8);

      return `
        <div class="conference-block">
          <div class="conf-title">${conf.name}</div>
          ${top8.map((t, idx) => {
            const isTracked = selectedTeams.includes(t.abbr);
            return `
              <div class="standing-row ${isTracked ? "highlight" : ""}">
                <div class="standing-left">
                  <span class="rank-num">${idx + 1}</span>
                  <img src="${t.logo}" style="width: 14px; height: 14px; object-fit: contain;" onerror="this.style.display='none'"/>
                  <span>${t.displayName}</span>
                </div>
                <span style="font-variant-numeric: tabular-nums;">${t.wins}-${t.losses} (${t.pctDisplay})</span>
              </div>
            `;
          }).join("")}
        </div>
      `;
    }).join("");
  } catch (err) {
    container.innerHTML = `<div class="empty-msg">Unable to load conference standings.</div>`;
  }
}

// 3. Teams Picker loader
async function loadTeamPicker() {
  const container = document.getElementById("team-list");
  const { selectedTeams = DEFAULT_TEAMS } = await chrome.storage.local.get("selectedTeams");

  if (cachedTeamsList.length === 0) {
    try {
      const res = await fetch(ESPN_TEAMS_API);
      const data = await res.json();
      const raw = data.sports?.[0]?.leagues?.[0]?.teams || [];

      cachedTeamsList = raw.map((t) => ({
        name: t.team.displayName,
        abbr: t.team.abbreviation,
        logo: t.team.logos?.[0]?.href || ""
      })).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      container.innerHTML = `<div class="empty-msg">Failed to load teams.</div>`;
      return;
    }
  }

  container.innerHTML = cachedTeamsList.map((t) => `
    <div class="team-pill-row" data-name="${t.name.toLowerCase()}">
      <div class="team-pill-left">
        <img src="${t.logo}" style="width: 20px; height: 20px; object-fit: contain;" onerror="this.style.display='none'"/>
        <span>${t.name}</span>
      </div>
      <label class="switch">
        <input type="checkbox" value="${t.abbr}" ${selectedTeams.includes(t.abbr) ? "checked" : ""}>
        <span class="slider"></span>
      </label>
    </div>
  `).join("");
}

document.getElementById("team-filter").oninput = (e) => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll(".team-pill-row").forEach((row) => {
    const name = row.getAttribute("data-name");
    row.style.display = name.includes(q) ? "flex" : "none";
  });
};

document.getElementById("save-teams-btn").onclick = async () => {
  const checked = document.querySelectorAll("#team-list input[type='checkbox']:checked");
  const chosen = Array.from(checked).map((cb) => cb.value);

  await chrome.storage.local.set({ selectedTeams: chosen });
  await chrome.storage.local.remove("lastNotifiedDate");
  chrome.runtime.sendMessage({ action: "refreshSchedule" });

  matchesBtn.click();
};

setInterval(() => {
  if (matchesView.style.display !== "none") {
    loadGames(selectedDateStr);
  }
}, 30000);

document.addEventListener("DOMContentLoaded", () => {
  buildDateCarousel();
  loadGames(selectedDateStr);
});