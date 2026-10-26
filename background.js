const ESPN_SCOREBOARD_API = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
const DEFAULT_TEAMS = ["LAL", "PHI"];

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["selectedTeams"], (res) => {
    if (!res.selectedTeams) {
      chrome.storage.local.set({ selectedTeams: DEFAULT_TEAMS });
    }
  });

  checkGames();
  chrome.alarms.create("checkNbaSchedule", { periodInMinutes: 2 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkNbaSchedule") {
    checkGames();
  } else if (alarm.name.startsWith("alert-")) {
    const gameId = alarm.name.replace("alert-", "");
    triggerPreGameNotification(gameId);
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "refreshSchedule") {
    checkGames();
  }
});

async function triggerPreGameNotification(gameId) {
  try {
    const res = await fetch(ESPN_SCOREBOARD_API);
    const data = await res.json();
    const game = data.events?.find((e) => e.id === gameId);

    if (game) {
      const comp = game.competitions[0];
      const home = comp.competitors.find((c) => c.homeAway === "home");
      const away = comp.competitors.find((c) => c.homeAway === "away");

      chrome.notifications.create(`pregame-${gameId}`, {
        type: "basic",
        iconUrl: "icon.png",
        title: "⏳ Tipoff in 15 Minutes!",
        message: `${away.team.displayName} @ ${home.team.displayName} is about to begin!`,
        priority: 2
      });
    }
  } catch (err) {
    console.error("Error triggering tipoff reminder:", err);
  }
}

async function checkGames() {
  try {
    const { selectedTeams = DEFAULT_TEAMS, lastKnownScores = {} } = await chrome.storage.local.get([
      "selectedTeams",
      "lastKnownScores"
    ]);

    if (!selectedTeams || selectedTeams.length === 0) return;

    const response = await fetch(ESPN_SCOREBOARD_API);
    if (!response.ok) return;

    const data = await response.json();
    const events = data.events || [];

    const matchedGames = events.filter((event) => {
      const competitors = event.competitions?.[0]?.competitors || [];
      return competitors.some((c) => selectedTeams.includes(c.team?.abbreviation));
    });

    if (matchedGames.length === 0) return;

    const updatedScoreCache = { ...lastKnownScores };

    matchedGames.forEach((game) => {
      const comp = game.competitions[0];
      const home = comp.competitors.find((c) => c.homeAway === "home");
      const away = comp.competitors.find((c) => c.homeAway === "away");
      const state = game.status.type.state;
      const detail = game.status.type.detail;
      const gameId = game.id;

      const currentScoreString = `${away.team.abbreviation} ${away.score || 0} - ${home.score || 0} ${home.team.abbreviation}`;

      if (state === "in") {
        const lastScore = lastKnownScores[gameId];
        if (lastScore !== currentScoreString) {
          chrome.notifications.create(`live-${gameId}`, {
            type: "basic",
            iconUrl: "icon.png",
            title: `🏀 Live Update: ${detail}`,
            message: currentScoreString,
            priority: 2
          });
          updatedScoreCache[gameId] = currentScoreString;
        }
      }

      if (state === "post" && lastKnownScores[gameId] !== "FINAL") {
        chrome.notifications.create(`final-${gameId}`, {
          type: "basic",
          iconUrl: "icon.png",
          title: "🏁 Final Score",
          message: currentScoreString,
          priority: 2
        });
        updatedScoreCache[gameId] = "FINAL";
      }
    });

    await chrome.storage.local.set({ lastKnownScores: updatedScoreCache });
  } catch (err) {
    console.error("Error checking live scores:", err);
  }
}