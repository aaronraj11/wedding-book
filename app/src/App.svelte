<script>
  // root state machine — port of legacy WeddingApp:
  // loading → admin → gate → guest kiosk (rsvp/checkin) → login → planner
  import { theme, C, initTheme } from "./stores/theme.svelte.js";
  import { app, initApp, openWedding, switchWedding, login, logout } from "./stores/session.svelte.js";
  import { LIGHT, DARK } from "./lib/constants.js";
  import Gate from "./screens/Gate.svelte";
  import Login from "./screens/Login.svelte";
  import Planner from "./screens/Planner.svelte";
  import GuestRSVP from "./screens/GuestRSVP.svelte";
  import GuestCheckIn from "./screens/GuestCheckIn.svelte";
  import Btn from "./components/Btn.svelte";
  import Card from "./components/Card.svelte";

  // push the palette into CSS custom properties + keep the phone status-bar
  // colour and native form colorScheme in step with the theme
  $effect(() => {
    const pal = theme.mode === "dark" ? DARK : LIGHT;
    for (const [k, v] of Object.entries(pal)) document.documentElement.style.setProperty(`--c-${k}`, v);
    document.documentElement.style.colorScheme = theme.mode;
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", theme.mode === "dark" ? "#1B1917" : "#FAF5F1");
  });

  $effect(() => {
    initTheme();
    initApp();
  });
</script>

{#if app.wedding === undefined || app.session === undefined}
  <div class="min-h-screen flex items-center justify-center" style="background:{C.ivory};color:{C.muted}">
    Checking who's at the door…
  </div>
{:else if app.adminMode}
  <!-- AdminPanel arrives in Phase E -->
  <div class="min-h-screen flex items-center justify-center px-4" style="background:{C.ivory};color:{C.ink}">
    <Card className="text-center">
      <div class="wb-serif" style="font-size:24px;font-weight:600">Master control</div>
      <p class="text-sm mt-2" style="color:{C.muted}">The admin panel is coming to the new app in a later phase.</p>
      <div class="mt-3"><Btn kind="ghost" onclick={() => (app.adminMode = false)}>← Back</Btn></div>
    </Card>
  </div>
{:else if !app.wedding}
  <Gate onOpen={openWedding} onAdmin={() => (app.adminMode = true)} />
{:else if app.guestMode === "checkin"}
  <GuestCheckIn onBack={() => (app.guestMode = null)} locked={app.guestLock} />
{:else if app.guestMode === "rsvp"}
  <GuestRSVP onBack={() => (app.guestMode = null)} locked={app.guestLock} />
{:else if !app.session}
  <Login onLogin={login} onSwitch={switchWedding} wedding={app.wedding} />
{:else}
  <Planner role={app.session.role} onLogout={logout} wedding={app.wedding} />
{/if}
