/**
 * scripts/generate_sportsfan_excel.js
 * Generates the complete 9-Tab Excel Workbook: "Sportsfan_SecondScreen_Workflow_Matrix.xlsx"
 * Fully updated with:
 *  1. Strict 4-Minute (240s) Active Countdown Timer on EVERY prediction and poll.
 *  2. Floating In-Room Notification ("Jump to Post") for predictions revealed 2-3 overs later after scrolling up.
 *  3. 7 Core Predefined Recognitions (Highest Viewed, Highest Liked, Highest Comments, Most Interacted,
 *     3 of 5 Posts, 1-2 Posts Starter, and Universal Least-Case Baseline so EVERY user gets recognized).
 *  4. TAB 9: Upcoming Match Live Operations Playbook (DRS & Controversial Decisions, Wicket Clusters,
 *     Milestones, Weather/DLS Shifts, and Parameterized Live Admin Prompt Library).
 */

const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const wb = XLSX.utils.book_new();

// ─── TAB 1: Start Here & System Overview ────────────────────────────────────
const tab1Data = [
  ["SPORTSFAN360 | SECOND-SCREEN FAN EXPERIENCE WORKFLOW & SPECIFICATION"],
  ["Document Version", "2.3 - 4-Minute Timer Standard & Live Operations Master Framework"],
  ["Reference Match", "New Zealand vs India — 1st T20I (Christchurch) | Applicable to Any Upcoming Live Match"],
  ["Target System", "Sportsfan360 Admin Panel + Real-time Fan Client (AWS DynamoDB + Firebase)"],
  ["Operational Scope", "Dual Purpose: Historical Audit Reference & Live Playbook for Testing Upcoming Matches"],
  [""],
  ["1. EXECUTIVE WORKFLOW ARCHITECTURE (END-TO-END)"],
  ["Step", "Phase", "System Actor", "Action / Function", "Data Payload / Event", "User Experience Impact"],
  [
    1,
    "Pre-Match Setup",
    "Admin",
    "Admin configures pre-defined engagements pool with strict 4-minute timers, mapped to match trigger points.",
    "ENGAGEMENT#META: { id, type: 'prediction'|'poll', timerMinutes: 4, durationMinutes: 4, question, options }",
    "Zero latency during live match; all cards pre-loaded with standardized 4-minute voting windows."
  ],
  [
    2,
    "Live Moment Detection",
    "Admin / Match Feed",
    "Admin triggers/pushes the specific engagement when a sporting moment occurs (over end, wicket, boundary, DRS, milestone).",
    "PUSH_ENGAGEMENT: { engagementId, matchId, over, status: 'active', publishedAt, expiresAt: publishedAt + 240000 }",
    "Real-time overlay card appears on fan screen within <500ms with a visible 4-minute countdown timer (04:00)."
  ],
  [
    3,
    "Fan Participation & 4-Min Timer",
    "Frontend Fan",
    "Fan submits their vote / prediction call on the engagement card with one tap while the 4-minute clock ticks down.",
    "FAN_VOTE: { userId, engagementId, selectedOptionId, timeToVoteSec } (+2 SXPs base)",
    "Instant feedback, haptic tap; countdown ring ticks from 04:00 to 00:00."
  ],
  [
    4,
    "Social Interaction in 4-Min Window",
    "Frontend Community",
    "Fans comment, like/roar, and reply to each other in the engagement discussion section during the 4-minute active window.",
    "FAN_COMMENT: { userId, engagementId, text, parentCommentId } / FAN_LIKE: { commentId }",
    "Debates ignite; comment likes and reply counts are tracked for social recognitions."
  ],
  [
    5,
    "4-Minute Timer Expiry & Auto-Lock",
    "Client / Backend Timer",
    "At exactly 4:00 (240s), the engagement strictly auto-locks! No further votes or predictions accepted.",
    "AUTO_LOCK_ENGAGEMENT: { engagementId, status: 'locked', lockedAt: publishedAt + 240000 }",
    "Fairness guaranteed: If a match event occurs before 4 minutes, early lock is enforced (min(4m, event_time))."
  ],
  [
    6,
    "Controversial / DRS Moment",
    "Admin / Live Ops",
    "If an umpire review occurs (LBW/caught behind), prompt instantly freezes; admin launches rapid controversial pulse with 4-min timer.",
    "FREEZE_CARD + PUSH_DRS_PULSE: { type: 'poll', timerMinutes: 4, question: 'Out or Not Out?' }",
    "Captures peak live broadcast tension without allowing fraudulent votes."
  ],
  [
    7,
    "Immediate vs Delayed Outcome",
    "Admin / System Feed",
    "POLLS: Reveal community % split immediately upon voting / 4-min expiry. PREDICTIONS: Verified answer revealed when the event concludes.",
    "SETTLE_PREDICTION: { engagementId, winningChoiceId: 'option_b', resolvedAt }",
    "If resolved immediately, card updates in-place with points payout (+10 SXPs bonus)."
  ],
  [
    8,
    "Delayed Outcome: Floating In-Room Notification ('Jump to Post')",
    "Frontend Client Engine",
    "If a prediction reveals 2-3 overs later (e.g. Over 3 PP call revealed at Over 6), the post has scrolled up. A floating sticky notification pill appears inside the room: '🎯 Prediction Result Revealed! Tap to Jump'. Clicking it smoothly auto-scrolls the feed to the post, highlights it with a glow, and displays the outcome & SXPs won.",
    "FLOATING_TOAST_SHOWN: { engagementId, title, targetAnchor: '#post-eng_003' } -> On Click: scrollIntoView({ behavior: 'smooth' })",
    "CRITICAL UX FIX: Ensures fans never miss delayed prediction outcomes even when the post has moved up off-screen!"
  ],
  [
    9,
    "6-Over Checkpoint Recognitions (Every 6 Overs)",
    "Gamification Engine",
    "At Over 6, Over 12, Over 18, and Innings End, app evaluates all participants across 7 Predefined Recognitions (Highest Views, Highest Likes, Highest Comments, Most Interacted, 3/5 Posts, 1-2 Posts, and Universal Least-Case Baseline).",
    "EVALUATE_RECOGNITIONS: { phase: 'OVERS_1_TO_6', userStats } -> Awards 7 Predefined Badges",
    "GUARANTEE: In the least case, EVERY user gets recognized (e.g. 3/5 posts, 1-2 posts, or active match witness). Zero users left out!"
  ],
  [
    10,
    "Repeat Loop Hook",
    "Core Loop",
    "Hook returns user to next live moment (wicket, drinks, 100 up, death overs).",
    "LOOP_CONTINUITY: { nextMomentId, anchor: 'Over 7' }",
    "High retention habit loop without spamming every single ball."
  ],
  [
    11,
    "End-of-Match Recap",
    "Post-Match Screen",
    "Comprehensive recap showing total participation, prediction accuracy, social heat, total SXPs won, and next match hook.",
    "MATCH_RECAP: { totalEngagements, predictionsWon, accuracyPct, totalSxps, badgesAwarded }",
    "Drives satisfaction, pride, and sets return intent for next fixture."
  ],
  [""],
  ["2. CORE OPERATING PRINCIPLES"],
  ["Principle", "Rule Definition", "Guardrail / Enforcement"],
  ["4-Minute Active Timer Standard", "Every prediction and poll card has a strict 4-minute (240s) active window. Countdown clock ticks from 04:00 to 00:00.", "Auto-locks at 00:00 strictly. Early lock enforced if verified match event occurs before 4 minutes."],
  ["Dynamic Match Adaptability", "System supports both pre-scheduled over-end prompts and unscripted live moments (DRS, wicket clusters, rain).", "Admin uses parameterized templates with one-click push during upcoming matches."],
  ["Floating In-Room Notifications", "Always show a floating sticky pill if a resolved prediction card is currently scrolled out of viewport.", "Auto-scrolls directly to post card; highlights with 2-second glowing pulse."],
  ["100% Inclusive Recognition", "At every 6-over checkpoint, at least 7 predefined recognitions ensure every user receives recognition.", "Tiers cover highest views, highest likes, highest comments, 3/5 posts, and least-case participation."],
  ["No Every-Ball Spam", "Engagements trigger at over ends, confirmed wickets, milestones, drinks, and innings breaks.", "Maximum 1 primary engagement per over; never interrupt a bowler run-up."],
  ["Deterministic Scoring", "SXP points and accuracy bonuses must be auditable and transparent.", "Base: +2 SXP; Accuracy: +10 SXP; Correct outcome locked before event occurs."]
];

// ─── TAB 2: Match Facts & Trigger Matrix ────────────────────────────────────
const tab2Data = [
  ["MATCH FACTS & TRIGGER SCHEDULE (NZ vs IND 1st T20I, Christchurch)"],
  ["Innings / Phase", "Over / Point", "Verified Cricket Event", "Engagement Type", "Prompt Title", "Admin Action", "Lock Point (4-Min Timer)", "Resolution Point & Floating Notification"],
  ["Pre-Match", "T-30 Min", "Confirmed Lineups & Pitch Report", "Poll", "Will Hagley Oval favor pace or spin early on?", "Push Pre-Match Pulse", "4-Min Timer (or Toss T-15m)", "Community split revealed immediately at Toss"],
  ["Pre-Match", "T-15 Min", "India won toss and elected to field", "Poll", "Toss Impact: Was bowling first the right call?", "Push Toss Poll", "4-Min Timer (or Ball 1)", "Reveals fan sentiment % before Ball 1"],
  ["NZ Innings", "0.6 (Over 1)", "NZ early tempo / opening spell", "Poll", "Who sets the tone in the first six overs?", "Push Over 1 Pulse", "4-Min Timer (Locks at 00:00)", "Instant sentiment split"],
  [
    "NZ Innings",
    "2.6 (Over 3)",
    "Opening partnership building",
    "Prediction",
    "Where will New Zealand finish after 6 overs?",
    "Push Powerplay Band Call",
    "4-Min Timer (Locks at Over 4.5)",
    "Resolved at Over 6.0 (NZ 65/1) -> Post scrolled up 3 overs! FLOATING NOTIFICATION triggers inside room to jump to post!"
  ],
  ["NZ Innings", "4.6 (Wicket 1)", "Tim Seifert dismissed at 49/1", "Poll", "Wicket at 49/1! Can India slow the Powerplay momentum?", "Push Wicket Reaction", "4-Min Timer (Locks at 00:00)", "Reveals fan reaction split immediately"],
  ["NZ Innings", "5.2 (Milestone)", "New Zealand reached 50 runs", "Poll", "50 up for NZ in 5.2 overs! Above or below your expectation?", "Push Milestone Pulse", "4-Min Timer (Locks at 00:00)", "Instant fan reaction"],
  [
    "NZ Innings",
    "6.0 (Over 6)",
    "NZ 65/1 — Powerplay End Checkpoint",
    "RECOGNITION",
    "POWERPLAY CHECKPOINT: 7 Predefined Recognitions & Band Resolution",
    "Trigger 6-Over Recognitions",
    "Immediate (No timer)",
    "Awards 7 Predefined Badges (Highest Views, Likes, Comments, 3/5 Posts, Least-Case Baseline)"
  ],
  [
    "NZ Innings",
    "7.4 (Wicket 2)",
    "Finn Allen dismissed at 80/2",
    "Prediction",
    "Next Wicket Timing: Will India strike again before Over 12?",
    "Push Wicket Reset",
    "4-Min Timer (Locks at Over 8.4)",
    "Resolved at Over 12.1 (Mitchell out) -> FLOATING NOTIFICATION triggers inside room to jump to post!"
  ],
  ["NZ Innings", "9.6 (Drinks)", "NZ 98/2 at Drinks Break", "Poll", "Drinks Debate: Should NZ consolidate or launch counterattack?", "Push Drinks Poll", "4-Min Timer (or End of Drinks)", "Community split revealed immediately"],
  [
    "NZ Innings",
    "10.2 (Milestone)",
    "NZ reached 100 runs",
    "Prediction",
    "100 up! What will be NZ's final total score band?",
    "Push Total Score Band",
    "4-Min Timer (Locks at Over 11.2)",
    "Resolved at Over 20.0 (NZ 225/4) -> FLOATING NOTIFICATION triggers to jump to Over 10 post!"
  ],
  ["NZ Innings", "12.1 (Wicket 3)", "Daryl Mitchell dismissed at 122/3", "Poll", "Wicket at 122/3: Does India have the middle overs under control?", "Push Wicket Pulse", "4-Min Timer (Locks at 00:00)", "Reveals fan sentiment % immediately"],
  [
    "NZ Innings",
    "12.0 (Over 12)",
    "Middle-Overs Checkpoint (NZ 122/3)",
    "RECOGNITION",
    "MIDDLE-OVERS CHECKPOINT: 7 Predefined Recognition Cards",
    "Trigger Mid-Innings Recognition",
    "Immediate (No timer)",
    "Show Over 12 Badges (Highest Views, Likes, Comments, 3/5 Posts, Least-Case Baseline)"
  ],
  ["NZ Innings", "14.2 (Milestone)", "NZ reached 150 runs", "Prediction", "Death Overs Prediction: How many runs will NZ score in last 5 overs?", "Push Death Phase Call", "4-Min Timer (Locks at Over 15.2)", "Resolved at Over 20.0 (75 runs) -> FLOATING NOTIFICATION jumps to post"],
  ["NZ Innings", "17.3 (Wicket 4)", "Bevon Jacobs run out at 195/4", "Poll", "Run-out at 195/4: Turning point or still on for 220+?", "Push Turning Point Pulse", "4-Min Timer (Locks at 00:00)", "Reveals fan sentiment % immediately"],
  [
    "NZ Innings",
    "18.1 (DRS Review)",
    "DRS LBW review on death overs boundary ball",
    "DRS Pulse Poll",
    "DRS Referral! Out or Not Out?",
    "Freeze Live Prompt + Push DRS Poll",
    "4-Min Timer (or 3rd Umpire Call)",
    "Decision confirmed on screen before revealing poll split. Zero prompt cheating."
  ],
  ["NZ Innings", "18.2 (Milestone)", "NZ reached 200 runs", "Prediction", "200 up! Will NZ finish below 220, 220–229, or 230+?", "Push Finishing Band", "4-Min Timer (Locks at Over 19.2)", "Resolved at 20.0 (225/4 -> 220–229)"],
  ["NZ Innings", "20.0 (Innings End)", "NZ 225/4 — Target 226 for India", "RECAP & PREDICTION", "Innings 1 Close: NZ 225/4. Target 226 to win!", "Resolve All Innings 1 Calls", "4-Min Timer (Locks at Ball 1 Chase)", "Innings 1 Recap + Win Prediction Opens"],
  [
    "IND Innings",
    "0.6 (Over 1)",
    "Chase Launch: Target 226",
    "Prediction",
    "Chase Launch: What will India score in the Powerplay (Overs 1-6)?",
    "Push India PP Band",
    "4-Min Timer (Locks at Over 2.0)",
    "Resolved at Over 6.0 (IND 94/1) -> FLOATING NOTIFICATION triggers to jump to Over 1 post!"
  ],
  ["IND Innings", "3.2 (Milestone)", "India reached 50 runs in 3.2 ov", "Poll", "Blistering start! 50 up in 20 balls. Can NZ pull back?", "Push Chase Pulse", "4-Min Timer (Locks at 00:00)", "Instant sentiment split"],
  ["IND Innings", "5.5 (Wicket 1)", "Abhishek Sharma dismissed at 93/1", "Poll", "Abhishek out at 93/1! Small setback or opening for NZ?", "Push Wicket Pulse", "4-Min Timer (Locks at Over 6.5)", "Reveals fan reaction % immediately"],
  [
    "IND Innings",
    "6.0 (Over 6)",
    "India 94/1 — Powerplay End Checkpoint",
    "RECOGNITION",
    "CHASE POWERPLAY CHECKPOINT: 7 Predefined Recognitions",
    "Trigger 6-Over Recognitions",
    "Immediate (No timer)",
    "Show 6-Over Badges (Highest Views, Likes, Comments, 3/5 Posts, Least-Case Baseline)"
  ],
  [
    "IND Innings",
    "6.5 (Milestone)",
    "India reached 100 runs in 6.5 ov",
    "Prediction",
    "100 up! Will India wrap up this chase inside 18 overs?",
    "Push 18-Over Call",
    "4-Min Timer (Locks at Over 7.5)",
    "Resolved at 18.0 (No, needed 19.4) -> FLOATING NOTIFICATION jumps to Over 6.5 post!"
  ],
  ["IND Innings", "8.6 (Wicket 2)", "Sanju Samson dismissed at 115/2", "Poll", "Set batter Samson out for 67! Confidence in India chase?", "Push Confidence Slider", "4-Min Timer (Locks at 00:00)", "Live confidence meter update"],
  ["IND Innings", "9.3 (Wicket 3)", "Tilak Varma dismissed at 117/3", "Poll", "Two quick wickets (117/3)! Rebuild steadily or keep attacking?", "Push Tactical Poll", "4-Min Timer (Locks at 00:00)", "Reveals tactical split"],
  ["IND Innings", "10.3 (Wicket 4)", "Ishan Kishan dismissed at 122/4", "Poll", "Wicket cluster (122/4)! Pressure spike. Still backing India?", "Push High-Leverage Poll", "4-Min Timer (Locks at 00:00)", "Fan confidence shift tracking"],
  [
    "IND Innings",
    "12.0 (Over 12)",
    "Chase Middle Checkpoint (138/4)",
    "RECOGNITION",
    "OVER 12 CHASE CHECKPOINT: 7 Predefined Recognition Cards",
    "Trigger Mid-Chase Recognition",
    "Immediate (No timer)",
    "Show Over 12 Badges (Highest Views, Likes, Comments, 3/5 Posts, Least-Case Baseline)"
  ],
  [
    "IND Innings",
    "13.1 (Milestone)",
    "India reached 150 runs",
    "Prediction",
    "150 up! What score will India reach by the end of Over 18?",
    "Push Target Checkpoint",
    "4-Min Timer (Locks at Over 14.1)",
    "Resolved at Over 18.0 (IND 210/6) -> FLOATING NOTIFICATION jumps to Over 13.1 post!"
  ],
  ["IND Innings", "14.3 (Wicket 5)", "Axar Patel dismissed at 167/5", "Poll", "Axar out at 167/5! Who must take responsibility to finish?", "Push Batter Pick Poll", "4-Min Timer (Locks at 00:00)", "Reveals fan pick % immediately"],
  ["IND Innings", "17.2 (Milestone)", "India reached 200 runs", "Prediction", "200 up! 26 needed from 16 balls. When does this match finish?", "Push Winning Over Band", "4-Min Timer (Locks at Over 18.2)", "Resolved at 19.4 -> Band: Last Over (19.1–19.6)"],
  ["IND Innings", "18.1 (Wicket 6)", "Shreyas Iyer dismissed at 210/6", "Poll", "Iyer out at 210/6! 16 needed from 11 balls. Match on a knife edge!", "Push Climax Pulse", "4-Min Timer (Locks at 00:00)", "Extreme tension sentiment"],
  ["IND Innings", "19.4 (Match End)", "India 230/6 — Target reached (Win by 4 wickets)", "RESULT & RECOGNITION", "INDIA WIN BY 4 WICKETS! Decisive moment & POTM Fan Vote", "Trigger Match Settlement", "4-Min Timer (Locks at 00:00)", "Resolves Winner Prediction (+10 SXP)"],
  [
    "Post-Match",
    "Post-Match Screen",
    "Official Player of the Match: Sanju Samson",
    "FULL RECAP",
    "END OF MATCH RECAP: Full Participation, Accuracy, SXPs & Badges",
    "Publish Match Summary",
    "Open / Persistent",
    "Displays total SXPs won, participation rate, next match preview"
  ]
];

// ─── TAB 3: Loop Log ────────────────────────────────────────────────────────
const tab3Data = [
  ["DETAILED LOOP LOG (4-Minute Timer, Experience, Rules & Floating Notifications)"],
  [
    "Loop ID",
    "Match Phase",
    "Anchor Trigger",
    "Verified Cricket State",
    "Engagement Type",
    "Prompt Copy",
    "Interactive Choices",
    "Lock Timing Rule (4-Min Countdown)",
    "Social Feature (Comments & Likes)",
    "Outcome Resolution & Floating Notification",
    "SXP Rewards",
    "6-Over Checkpoint?",
    "Return Hook to Next Moment"
  ],
  [
    "PRE-01",
    "Pre-Match",
    "T-15m Toss Event",
    "India won toss, bowling first",
    "Poll",
    "India chose to field first at Hagley Oval. What do you think?",
    "A: Smart call (dew factor) | B: Risky (NZ bat deep) | C: Neutral",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00, or Ball 1)",
    "Fans share brief reasons; likes enabled on best tactical opinions.",
    "Poll Distribution revealed immediately upon vote / 4-min expiry; sentiment % shown.",
    "+2 SXPs (Participation)",
    "No",
    "Over 1 Opening Spell"
  ],
  [
    "NZ-01",
    "NZ Innings",
    "Over 1 End",
    "NZ 8/0 after 1 over",
    "Poll",
    "Opening spell: Who sets the tone in the first six overs?",
    "A: NZ Top Order | B: India New-Ball Bowlers",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00)",
    "Thread opens on seam movement vs pitch bounce.",
    "Shows live community percentage split.",
    "+2 SXPs (Participation)",
    "No",
    "Over 2 Bowling Response"
  ],
  [
    "NZ-03",
    "NZ Innings",
    "Over 3 End",
    "NZ 28/0 after 3 overs",
    "Prediction",
    "Where will New Zealand finish after 6 overs (Powerplay)?",
    "A: Under 50 | B: 50–64 | C: 65–79 | D: 80+",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00; hard cutoff Over 4.5)",
    "Fans debate boundary rate; replies nested under predictions.",
    "RESOLVED AT OVER 6.0! Because post scrolled up 3 overs, a FLOATING NOTIFICATION appears: '🎯 PP Score Band Result OUT! Tap to jump'. On click, auto-scrolls up to card, shows Band C won (+10 SXPs).",
    "+2 SXPs base (+10 accuracy)",
    "No",
    "Wicket 1 / Over 5"
  ],
  [
    "NZ-04",
    "NZ Innings",
    "Wicket 4.6",
    "Tim Seifert out at 49/1",
    "Poll",
    "Seifert falls at 49/1! Can India pull back the scoring rate now?",
    "A: Yes, middle overs lock | B: No, NZ will counterattack",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00)",
    "Abhay reacts: 'Huge breakthrough!'; Suzy notes run-rate is still high.",
    "Shows live percentage split immediately.",
    "+2 SXPs (Participation)",
    "No",
    "Powerplay End (Over 6)"
  ],
  [
    "NZ-06-CP",
    "NZ Innings",
    "Powerplay End (Over 6.0)",
    "NZ 65/1 after 6 overs",
    "RECOGNITION CHECKPOINT",
    "OVER 6 POWERPLAY RECOGNITION: Celebrating your calls and hot takes!",
    "Interactive Carousel: 7 Predefined Recognitions (Highest Views, Likes, Comments, 3/5 Posts, Baseline)",
    "Evaluates instantly at Over 6.0",
    "Surfaces: 1. Highest Views, 2. Highest Likes, 3. Highest Comments, 4. Most Interacted, 5. Interacted in 3/5 Posts, 6. Starter (1-2 Posts), 7. Matchday Witness.",
    "Prediction Band C resolved (+10 SXPs); 100% of fans receive recognition.",
    "+5 to +25 SXPs bonus badges",
    "YES (Checkpoint 1)",
    "Over 7 Post-Powerplay Strategy"
  ],
  [
    "NZ-08",
    "NZ Innings",
    "Wicket 7.4",
    "Finn Allen out at 80/2",
    "Prediction",
    "Finn Allen gone at 80/2! Will India take another wicket before Over 12?",
    "A: Yes, India strike again | B: No, NZ consolidate",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00)",
    "Social debate: 'Allen was key to 200+'. Upvoting active.",
    "RESOLVED AT OVER 12.1 (Mitchell out)! Post is 4 overs up. FLOATING NOTIFICATION triggers: '🎯 Wicket Prediction Resolved! Tap to view'. Jumps to post, awards +10 SXPs.",
    "+2 SXPs base (+10 accuracy)",
    "No",
    "Drinks Break (Over 9.6)"
  ],
  [
    "NZ-10",
    "NZ Innings",
    "Drinks 9.6",
    "NZ 98/2 at Drinks",
    "Poll",
    "Drinks Checkpoint: Is NZ on track for 200+?",
    "A: Easily 200+ | B: 180-199 | C: Under 180",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00, or end of drinks)",
    "Break debate: Community sentiment split displayed.",
    "Instant breakdown of room expectations.",
    "+2 SXPs (Participation)",
    "No",
    "100 Milestone (Over 10.2)"
  ],
  [
    "NZ-11",
    "NZ Innings",
    "100 Up (10.2)",
    "NZ 100/2 reached",
    "Prediction",
    "100 up in 10.2! Pick New Zealand's final first-innings total band:",
    "A: Below 200 | B: 200–219 | C: 220–235 | D: 236+",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00)",
    "Suzy predicts 220-235; Abhay doubts death bowling. Comments stream.",
    "RESOLVED AT OVER 20.0 (NZ 225/4). FLOATING NOTIFICATION triggers at Innings Break: '🎯 Final Total Band Settled! Tap to view'. Jumps to Over 10 post, awards +10 SXPs.",
    "+2 SXPs base (+10 accuracy)",
    "No",
    "Over 12 Checkpoint"
  ],
  [
    "NZ-12-CP",
    "NZ Innings",
    "Over 12.0 Checkpoint",
    "NZ 122/2 (Mitchell out 12.1)",
    "RECOGNITION CHECKPOINT",
    "OVER 12 MIDDLE-OVERS RECOGNITION: The Room's Sharpest Voices!",
    "Interactive Carousel: 7 Predefined Recognitions for Middle-Overs phase",
    "Evaluates instantly at Over 12.0",
    "Awards 7 Predefined Badges: Highest Views, Highest Likes, Highest Comments, Most Interacted, 3/5 Posts, 1-2 Posts, and Universal Baseline.",
    "Displays phase SXP gains and ladder rank.",
    "+5 to +15 SXPs bonus badges",
    "YES (Checkpoint 2)",
    "Over 13 Acceleration"
  ],
  [
    "NZ-14",
    "NZ Innings",
    "150 Up (14.2)",
    "NZ 150/3 reached",
    "Prediction",
    "Death Overs Burst: How many runs will NZ score in the final 5 overs?",
    "A: Under 50 | B: 50–65 | C: 66–80 | D: 81+",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00)",
    "Debate on death yorkers vs short boundaries.",
    "RESOLVED AT OVER 20.0 (75 runs). FLOATING NOTIFICATION triggers to jump to Over 14 post.",
    "+2 SXPs base (+10 accuracy)",
    "No",
    "Wicket 17.3 / 200 Milestone"
  ],
  [
    "NZ-18",
    "NZ Innings",
    "200 Up (18.2)",
    "NZ 200/4 reached",
    "Prediction",
    "200 up with 10 balls left! Will NZ reach 225+?",
    "A: Yes, 225 or more | B: No, stopped under 225",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00)",
    "Fast 1-tap call during high-octane hitting.",
    "Resolved at 20.0 (NZ 225/4). Option A wins (+10 SXPs).",
    "+2 SXPs base (+10 accuracy)",
    "No",
    "Innings Break Close"
  ],
  [
    "NZ-20-INN",
    "Innings Break",
    "Innings 1 Close",
    "NZ 225/4 (Target: 226)",
    "RECAP & CHASE PREDICTION",
    "Innings 1 Settled: NZ set 226! Who wins the 1st T20I?",
    "A: India chase 226 | B: NZ defend 225",
    "Strict 4-Min Timer (Locks at 00:00 or Ball 1 of Chase)",
    "Full debate room opens during 15-min break. Fans exchange hot takes.",
    "Resolves all Innings 1 score predictions. Winning prediction settles at match end.",
    "+2 SXPs base (+10 accuracy)",
    "YES (Innings Recap)",
    "India Chase Launch (Over 1)"
  ],
  [
    "IND-01",
    "India Chase",
    "Chase Launch (Over 1)",
    "Target 226, IND 12/0",
    "Prediction",
    "Chase Tempo: What will India score in the Powerplay (Overs 1-6)?",
    "A: Under 60 | B: 60–74 | C: 75–89 | D: 90+",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00)",
    "Suzy predicts 90+ aggressive launch; Abhay backs cautious 60-74.",
    "RESOLVED AT OVER 6.0 (IND 94/1). Post is 5 overs up! FLOATING NOTIFICATION triggers: '🎯 Chase PP Score Result OUT! Tap to jump'. Jumps to Over 1 card, shows Band D won (+10 SXPs).",
    "+2 SXPs base (+10 accuracy)",
    "No",
    "50 Milestone (3.2)"
  ],
  [
    "IND-03",
    "India Chase",
    "50 Up (3.2)",
    "IND 50/0 in 20 balls",
    "Poll",
    "50 up in just 3.2 overs! Is India currently ahead of the required rate?",
    "A: Way ahead (Cruising) | B: Ahead, but wickets are key | C: Par",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00)",
    "Fans react to Abhishek's boundary spree. High like activity.",
    "Shows live sentiment breakdown immediately.",
    "+2 SXPs (Participation)",
    "No",
    "Wicket 5.5 / Over 6 Checkpoint"
  ],
  [
    "IND-06-CP",
    "India Chase",
    "Chase Powerplay (6.0)",
    "IND 94/1 after 6 overs",
    "RECOGNITION CHECKPOINT",
    "CHASE POWERPLAY RECOGNITION: The Chase Masterminds!",
    "Interactive Carousel: 7 Predefined Recognitions for Chase Powerplay",
    "Evaluates instantly at Over 6.0",
    "Evaluates 7 Predefined Badges: Highest Views, Likes, Comments, Most Interacted, 3/5 Posts, 1-2 Posts, and Universal Baseline.",
    "Band D settled (+10 SXPs). 100% of participants receive recognition.",
    "+5 to +25 SXPs bonus badges",
    "YES (Checkpoint 3)",
    "100 Milestone (Over 6.5)"
  ],
  [
    "IND-07",
    "India Chase",
    "100 Up (6.5)",
    "IND 100/1 in 41 balls",
    "Prediction",
    "100 up in 6.5 overs! Will India wrap up this chase inside 18 overs?",
    "A: Yes, finished inside 18 | B: No, goes to 19th or 20th over",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00)",
    "Debate on whether NZ bowlers can force errors.",
    "RESOLVED AT OVER 18.0 (No, match went to 19.4). Post is 11 overs up! FLOATING NOTIFICATION triggers to jump to Over 6.5 post.",
    "+2 SXPs base (+10 accuracy)",
    "No",
    "Samson Wicket (8.6)"
  ],
  [
    "IND-09",
    "India Chase",
    "Wicket 8.6",
    "Samson out for 67 (115/2)",
    "Poll",
    "Sanju Samson falls for 67! How confident are you in India's chase now?",
    "A: High (100% win) | B: Moderate (50-50) | C: Nervous (NZ edge)",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00)",
    "Sudden mood shift in comments; Abhay gets anxious; Suzy holds firm.",
    "Live confidence dial updates across the community.",
    "+2 SXPs (Participation)",
    "No",
    "Wicket Cluster (9.3 & 10.3)"
  ],
  [
    "IND-11",
    "India Chase",
    "Wicket Cluster (122/4)",
    "Tilak (117/3), Ishan (122/4)",
    "Poll",
    "Wicket cluster! India 122/4. What is the smartest strategy now?",
    "A: Rebuild with singles | B: Keep attacking boundaries",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00)",
    "Debate heats up: 'Don't let required rate climb!'.",
    "Community strategy split shown immediately.",
    "+2 SXPs (Participation)",
    "No",
    "Over 12 Checkpoint"
  ],
  [
    "IND-12-CP",
    "India Chase",
    "Over 12.0 Checkpoint",
    "IND 138/4 after 12 overs",
    "RECOGNITION CHECKPOINT",
    "OVER 12 CHASE RECOGNITION: Nerves of Steel Awards!",
    "Interactive Carousel: 7 Predefined Recognitions for Middle Chase",
    "Evaluates instantly at Over 12.0",
    "Evaluates 7 Predefined Badges: Highest Views, Likes, Comments, Most Interacted, 3/5 Posts, 1-2 Posts, and Universal Baseline.",
    "Phase SXP updates and ladder badge progression.",
    "+5 to +15 SXPs bonus badges",
    "YES (Checkpoint 4)",
    "150 Milestone (13.1)"
  ],
  [
    "IND-13",
    "India Chase",
    "150 Up (13.1)",
    "IND 150/4 reached",
    "Prediction",
    "150 reached! What score will India reach by the end of Over 18?",
    "A: Under 195 | B: 195–204 | C: 205–214 | D: 215+",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00)",
    "Calculations of required run rate shared in comments.",
    "RESOLVED AT OVER 18.0 (IND 210/6). Post is 5 overs up! FLOATING NOTIFICATION triggers to jump to Over 13.1 post.",
    "+2 SXPs base (+10 accuracy)",
    "No",
    "Axar Wicket (14.3)"
  ],
  [
    "IND-14",
    "India Chase",
    "Wicket 14.3",
    "Axar out at 167/5",
    "Poll",
    "Axar falls at 167/5! Who must take responsibility to finish this chase?",
    "A: Shreyas Iyer | B: Lower order (Dhir/Sundar) | C: Team effort",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00)",
    "Fans cheer on Naman Dhir and Shreyas Iyer.",
    "Shows community backing percentage.",
    "+2 SXPs (Participation)",
    "No",
    "200 Milestone (17.2)"
  ],
  [
    "IND-17",
    "India Chase",
    "200 Up (17.2)",
    "IND 200/5 reached",
    "Prediction",
    "200 up! 26 needed from 16 balls. When does this match finish?",
    "A: Over 19 (18.1–19.0) | B: Last Over (19.1–19.6) | C: NZ wins",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00)",
    "Extreme tension. High-velocity 1-tap voting.",
    "Resolved at 19.4 (Band B wins). Option B wins (+10 SXPs).",
    "+2 SXPs base (+10 accuracy)",
    "No",
    "Iyer Wicket (18.1)"
  ],
  [
    "IND-18",
    "India Chase",
    "Wicket 18.1",
    "Shreyas Iyer out at 210/6",
    "Poll",
    "Iyer out at 210/6! 16 needed from 11 balls. Can Naman Dhir get India home?",
    "A: Yes, India win | B: NZ steal it",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00)",
    "Final sprint sentiment. Highest comments density of the match.",
    "Instant final pulse split.",
    "+2 SXPs (Participation)",
    "No",
    "Winning Moment (19.4)"
  ],
  [
    "IND-19.4",
    "Winning Moment",
    "19.4 Overs",
    "IND 230/6 — India win by 4 wkts",
    "RESULT RESOLUTION",
    "INDIA WIN BY 4 WICKETS! What was the turning point of the chase?",
    "A: Samson's 67 (33) | B: Opening 94/1 PP | C: Naman Dhir's finish",
    "Strict 4-Min Timer (Ticking 04:00 to 00:00)",
    "Massive celebration in comments; fans upvote turning points and share MVP takes.",
    "Resolves Match Winner Prediction (+10 SXPs). Official POTM displayed.",
    "+10 SXPs (Winner call) + +5 SXPs (Vote)",
    "YES (Match Result)",
    "Final Match Recap & Celebration"
  ],
  [
    "POST-RECAP",
    "Post-Match",
    "Final Screen",
    "Series 1-0 to India",
    "END-OF-MATCH RECAP",
    "MATCHDAY RECAP & SXP SUMMARY: Your Complete Performance Card",
    "Interactive Recap: Accuracy %, Total SXPs, Badges, Next Match Reminder",
    "Open / Persistent",
    "Leaderboard rankings, friend comparisons, badge showcase.",
    "Audits all transactions, credits final total SXPs, unlocks ladder badges.",
    "Comprehensive SXPs credited to wallet",
    "YES (Final Recap)",
    "Next Match Preview (24 Oct 2nd T20I)"
  ]
];

// ─── TAB 4: Fan Journeys ────────────────────────────────────────────────────
const tab4Data = [
  ["FAN JOURNEYS & BEHAVIORAL PATHS (Across Key Match Milestones)"],
  ["Match Milestone", "Cricket Context", "Abhay (Opinionated Chatter)", "Suzy (Competitive Predictor)", "Casual Fan (Rohan - Baseline)", "Shared Room Outcome", "Next Return Hook"],
  [
    "Pre-Match & Toss",
    "India bowl first at Hagley Oval",
    "Shares tactical comment: 'Chasing is better here, ground gets easier under lights.'",
    "Predicts India win + 1st innings total 200+. Locks early within 4 mins.",
    "Taps 'Smart call' on toss poll (1 action, no comment).",
    "All three see initial sentiment split (68% agree with bowling first).",
    "Over 1 Opening Spell"
  ],
  [
    "NZ Powerplay (0-6)",
    "NZ race to 65/1",
    "Reacts to Seifert's dismissal; comments on Indian seamers' length.",
    "Locks Powerplay Band C (65-79) at Over 3 within 4-min timer. Tracks rate.",
    "Votes on Over 3 score band (Action 2/5 in phase).",
    "Suzy wins Powerplay prediction (+10 SXPs). Abhay gets 8 likes on comment.",
    "Over 6 Powerplay Checkpoint"
  ],
  [
    "Delayed Outcome Jump",
    "Over 6.0 PP Resolution",
    "Sees Floating Notification: '🎯 PP Score Band Result OUT!'. Clicks it -> feed auto-scrolls up to Over 3 card.",
    "Clicks Floating Notification -> auto-scrolls up to Over 3 card, sees green WIN badge and +10 SXPs.",
    "Clicks Floating Notification -> auto-scrolls to Over 3 card, sees outcome revealed.",
    "Fans never miss delayed results even when cards have moved off-screen!",
    "6-Over Recognitions"
  ],
  [
    "Over 6 Recognition",
    "NZ 65/1 Checkpoint",
    "Earns #2 'Highest Liked' (8 likes on comment) + #3 'Highest Comments'.",
    "Earns #4 'Most Interacted' + Powerplay Prophet (100% correct band).",
    "Earns #5 'Interacted in 3/5 Posts' (Loyal Companion) + #6 'Starter Participation'.",
    "EVERY user receives recognition! 100% coverage guaranteed.",
    "Over 7 Middle Overs"
  ],
  [
    "Middle Overs (7-15)",
    "NZ 150/3 at Over 14.2",
    "Debates with rival fans on drinks break: 'India need 2 wickets now.'",
    "Predicts death overs burst (Band C: 66-80). Calculates economy rates.",
    "Votes in Drinks Poll within 4 mins (Action 3).",
    "Abhay sparks 4 replies; Suzy's band locks in.",
    "Over 12 Checkpoint & Death overs"
  ],
  [
    "Innings Break",
    "NZ set 226 for India",
    "Comments: 'Massive target, but Hagley Oval is fast. Opening 6 will decide it.'",
    "Locks India chase prediction + winning over band (Over 19-20).",
    "Votes on winning team poll (Action 4).",
    "Innings 1 prediction outcomes revealed via Floating Toasts. SXP balances update.",
    "Chase Launch (Over 1)"
  ],
  [
    "Chase Powerplay (0-6)",
    "India 94/1 in 6 overs",
    "Celebrates Abhishek's 50; replies to Suzy: 'This is T20 batting at its peak!'",
    "Correctly predicted Band D (90+ runs). Scores another +10 SXPs via Floating Jump.",
    "Votes on Over 1 band + Over 3 pulse (Action 5).",
    "Community excitement peaks. Highest engagement velocity of match.",
    "Over 6 Chase Checkpoint"
  ],
  [
    "Over 6 Chase Checkpoint",
    "IND 94/1 Checkpoint",
    "Earns #2 'Highest Liked' + #4 'Most Interacted'.",
    "Earns #4 'Most Interacted' + Streak Master.",
    "Earns #5 'Interacted in 3/5 Posts' (Loyal Companion).",
    "All users celebrate milestone; 100% recognition rate maintained.",
    "Over 7 Samson wicket & collapse"
  ],
  [
    "Wicket Cluster (9-12)",
    "India slip from 115/1 to 122/4",
    "Posts anxious take: 'Need a rebuild, don't throw it away!'. Upvotes others.",
    "Adjusts confidence slider to 50-50; predicts match will go to last over.",
    "Votes on 'Rebuild or Attack' poll within 4 mins.",
    "One high-priority prompt prevents spam. Community mood shifts to tense.",
    "Over 13 Target tracking"
  ],
  [
    "Death Overs (16-19)",
    "IND 210/6, Iyer out 18.1",
    "Cheers Naman Dhir: 'Come on youngster! One boundary changes it.'",
    "Locks winning over prediction: Over 19-20. Watches required run rate.",
    "Votes on Over 18 tension pulse.",
    "Massive comment volume. Top takes highlighted in real-time.",
    "19.4 Winning Moment"
  ],
  [
    "Winning Moment (19.4)",
    "India reach 230/6, win by 4 wkts",
    "Votes Samson for turning point; high-fives community in chat.",
    "Wins match winner prediction (+10 SXPs) and winning over call (+10 SXPs).",
    "Votes on turning point poll.",
    "Confetti animation, official POTM (Samson) revealed separately from fan awards.",
    "Final Match Recap Screen"
  ],
  [
    "Post-Match Recap",
    "Final Screen",
    "Total SXPs: 138 | Badges: Highest Liked, Highest Comments, Loyal Companion.",
    "Total SXPs: 162 | Badges: Highest Viewed, Most Interacted, Powerplay Prophet.",
    "Total SXPs: 68 | Badges: Interacted in 3/5 Posts, Starter, Matchday Witness.",
    "All three fans feel accomplished, see SXP gains, and toggle reminder for 2nd T20I.",
    "24 Oct 2nd T20I Preview"
  ]
];

// ─── TAB 5: Prompts, Logic & Rules Engine ────────────────────────────────────
const tab5Data = [
  ["PROMPTS, 4-MINUTE TIMER, FLOATING NOTIFICATIONS & RULES ENGINE SPECIFICATION"],
  ["Rule Category", "Feature / Component", "Logical Definition", "Technical Trigger & Formula", "Edge Cases & Safety Rules", "SXP / Gamification Payout"],
  [
    "Timer Engine",
    "4-Minute (240s) Active Countdown Timer",
    "Every prediction and poll card has a strict 4-minute active window. Ticks from 04:00 down to 00:00 in real-time.",
    "Timer: `expiresAt = publishedAt + 240000`. Progress: `remainingSec = Math.max(0, Math.floor((expiresAt - now) / 1000))`.",
    "Auto-locks strictly at 00:00. If verified sporting event concludes earlier (e.g. ball bowled at 3m10s), early lock is enforced: `min(4m, event_time)`.",
    "Protects integrity while giving all fans ample time to vote and comment."
  ],
  [
    "Delayed Outcome Feature",
    "Floating In-Room Notification ('Jump to Post')",
    "When a prediction is resolved after 2-3 overs, the original card has scrolled off-screen. A floating sticky pill renders at top/bottom of the room: '🎯 Result Revealed: [Question Title]! Tap to View'.",
    "Trigger condition: `prediction_resolved == true && isCardInViewport(cardId) == false`. On Click: `document.getElementById(cardId).scrollIntoView({ behavior: 'smooth', block: 'center' })`.",
    "Target card gets a 2-second glowing highlight (`box-shadow: 0 0 20px #10B981`). Floating pill auto-dismisses on click or fades after 12s.",
    "Directs user to view their +10 SXPs accuracy reward or participation SXPs."
  ],
  [
    "Engagement Types",
    "Poll (Sentiment)",
    "No right or wrong answer. Collects community sentiment and displays percentage distribution immediately.",
    "Option_Pct = (Option_Votes / Total_Votes) * 100",
    "Percentages must sum to exactly 100%. At 4:00 timer expiry, poll locks and final distribution freezes.",
    "+2 SXPs for submitting vote."
  ],
  [
    "Engagement Types",
    "Prediction (Outcome)",
    "Deterministic contest with predefined correct answer. Settleable by Admin or verified feed.",
    "Status transitions: 'open' (4 mins) -> 'locked' (at 00:00) -> 'settled'. If UserChoice == WinningChoice -> Accuracy Bonus.",
    "If match abandoned or event washed out, status becomes 'void'; stake/points refunded.",
    "+2 SXPs for participating; +10 SXPs accuracy bonus if correct."
  ],
  [
    "Controversial Events",
    "DRS Review Protocol",
    "Instant card freeze during LBW, caught behind, stumping, or boundary review referrals.",
    "Prompt state: `status = 'frozen'` -> launch DRS Pulse Poll: 'Out or Not Out?' with 4-min timer.",
    "NEVER resolve based on TV commentator speculation. Wait until 3rd umpire decision displays on big screen.",
    "Protects integrity and boosts live excitement."
  ],
  [
    "Engagement Types",
    "Discussion / Comments",
    "Social commenting thread attached to each engagement card. Supports 1-level nested replies and like toggles.",
    "User can post text (max 280 chars) and like comments. Like count = SUM(likes) - SUM(unlikes).",
    "Rate limit: Max 1 comment per 10 seconds per user. Profanity filter auto-hides abusive text.",
    "+1 SXP for posting comment (capped at 5/match); +1 SXP per 5 likes received."
  ],
  [
    "Card Serving Logic",
    "Trigger Schedule",
    "Engagements served at over ends, confirmed dismissals, 50/100/150/200 milestones, drinks, and innings breaks.",
    "Trigger condition: `(event == 'OVER_END' && no_higher_priority_event) || (event == 'WICKET_CONFIRMED')`",
    "Never serve prompt during a bowler's run-up or during live ball delivery.",
    "Ensures uninterrupted live sports viewing."
  ],
  [
    "Locking Rules",
    "Anti-Cheat & Fairness",
    "Predictions must strictly lock BEFORE the outcome can be known or before phase commences.",
    "Lock timestamp = `min(publishedAt + 240000, event_occurrence_timestamp)`.",
    "If DRS review is signaled, FREEZE the card immediately. Do not accept votes during review.",
    "Protects integrity and fairness of prediction scoring."
  ],
  [
    "Deduplication",
    "Prompt Flooding Prevention",
    "Maximum 1 primary engagement card active at any moment. High-salience events suppress low-salience cards.",
    "Priority Hierarchy: Wicket (P1) > Milestone (P2) > Review Freeze (P3) > Over-End Pulse (P4).",
    "If a wicket falls while an over-end prompt is open, auto-archive the over-end prompt and show wicket card.",
    "Avoids UI clutter and cognitive overload."
  ],
  [
    "Outcome Revelation",
    "Resolution Mechanism",
    "Polls reveal sentiment split instantly upon user voting / 4-min expiry. Predictions reveal correct answer when event verifies.",
    "Admin selects `winningChoiceId` in Admin Panel OR Feed auto-resolves via scorecard webhook.",
    "Audit trail: Store `resolvedAt`, `resolvedBy`, and `sourceProof` in database.",
    "Winners receive instant push/card celebration."
  ],
  [
    "6-Over Checkpoint",
    "7 Predefined Recognitions Batch",
    "At over 6.0, 12.0, 18.0, and Innings End, system runs recognition batch job evaluating the 7 Predefined Recognitions.",
    "`RUN_RECOGNITION_BATCH(phase, matchId)`: Evaluates user activity across 7 Predefined Tiers.",
    "GUARANTEE: In the least case, every user gets recognized (e.g. 3/5 posts, 1-2 posts, or active room witness).",
    "Displays 6-Over Celebration Carousel overlay."
  ],
  [
    "Gamification Engine",
    "SXP Points Economy",
    "Points credited to user wallet in DynamoDB & Firestore dual-write.",
    "`Total_Match_SXPs = SUM(Base_Participation) + SUM(Accuracy_Bonuses) + SUM(Social_Bonuses) + SUM(Checkpoint_Badges)`",
    "Idempotency: Transaction IDs structured as `eng_vote_{id}_{uid}` and `eng_accuracy_{id}_{uid}` to prevent double credit.",
    "Audited in real-time wallet ledger."
  ]
];

// ─── TAB 6: 7 Predefined Recognitions Matrix ────────────────────────────────
const tab6Data = [
  ["7 PREDEFINED RECOGNITIONS MATRIX (6-Over Milestone Engine — 100% Inclusive)"],
  [
    "No.",
    "Recognition Name",
    "Badge ID",
    "Tier Category",
    "Exact Qualification Logic & Trigger Formula",
    "Inclusive Fallback Condition",
    "Card Headline & Copy",
    "SXP Bonus",
    "Frequency",
    "Icon Asset Path"
  ],
  [
    1,
    "Highest Viewed",
    "REC_01_HIGHEST_VIEWED",
    "Social & Viral Star",
    "User's comment, reaction, or post received the highest view/impression count in the room during the 6-over phase.",
    "If top user already has another Tier 1 badge, awarded to 2nd highest viewed post.",
    "⚡ STADIUM SPOTLIGHT / HIGHEST VIEWED! Eyes on you! Your post got the highest views across the fan room this phase.",
    "+25 SXPs",
    "Over 6, 12, 18, End",
    "/images/badges/sharesl4.png"
  ],
  [
    2,
    "Highest Liked",
    "REC_02_HIGHEST_LIKED",
    "Social & Viral Star",
    "User's comment or post received the highest number of likes/roars in the room during the 6-over phase (Min 3 likes).",
    "In case of a tie, awarded to all tied users with highest likes.",
    "🔥 HOT TAKE MVP / HIGHEST LIKED! The room loved your take! Your comment got the most likes in the phase.",
    "+25 SXPs",
    "Over 6, 12, 18, End",
    "/images/badges/communityl4.png"
  ],
  [
    3,
    "Highest Comments for Our Posts",
    "REC_03_HIGHEST_COMMENTS",
    "Social & Viral Star",
    "User's post or comment sparked the highest number of direct replies and comments from other fans in the room.",
    "If tie, awarded to top 2 discussion starters.",
    "💬 DEBATE IGNITER / MOST DISCUSSED! You got the dugout talking! Your post generated the highest comments and replies.",
    "+20 SXPs",
    "Over 6, 12, 18, End",
    "/images/badges/commentsl4.png"
  ],
  [
    4,
    "Highest Participation (Most Interacted)",
    "REC_04_MOST_INTERACTED",
    "High Engagement Star",
    "User participated / interacted in the highest number of posts/prompts in the phase (e.g. 4 or 5 out of 5 prompts).",
    "Awarded to any user who participated in >=4 engagements in the phase.",
    "🏃 PACE SETTER / SUPER FAN! Maximum hustle! You participated in nearly every single moment this phase.",
    "+15 SXPs",
    "Over 6, 12, 18, End",
    "/images/badges/postl2.png"
  ],
  [
    5,
    "Interacted in 3 out of 5 Posts",
    "REC_05_THREE_OF_FIVE_POSTS",
    "Active Contributor",
    "User participated / interacted in 3 out of 5 engagement posts in the phase (`COUNT(participated) >= 3`).",
    "EXPLICIT REQUIREMENT: Catches consistent fans who interacted in 3/5 posts.",
    "🤝 LOYAL COMPANION (3/5 POSTS)! Rock-solid support! You stayed engaged across 3 of 5 match moments.",
    "+10 SXPs",
    "Over 6, 12, 18, End",
    "/images/badges/communityl2.png"
  ],
  [
    6,
    "Starter Participation (1-2 Posts)",
    "REC_06_STARTER_PARTICIPATION",
    "Early Bird / Starter",
    "User participated in 1 or 2 engagement posts during the 6 overs (`COUNT(participated) >= 1 && < 3`).",
    "GUARANTEE: Ensures users who only voted once or twice still get celebrated.",
    "🏏 POWERPLAY STARTER! You made your mark! Thanks for stepping up to the crease this phase.",
    "+5 SXPs",
    "Over 6, 12, 18, End",
    "/images/badges/postl1.png"
  ],
  [
    7,
    "Universal Least-Case Guarantee",
    "REC_07_UNIVERSAL_BASELINE",
    "Universal Baseline (100% Inclusive)",
    "In the least case, every user who entered the second screen room, opened a card, or followed live action gets recognized.",
    "ABSOLUTE BASELINE: Ensures ZERO users are left behind without recognition at the 6-over mark.",
    "👀 MATCHDAY WITNESS! You're in the building! Watching every ball live with the Sportsfan community.",
    "+5 SXPs",
    "Over 6, 12, 18, End",
    "/images/badges/commentsl1.png"
  ],
  [""],
  ["BONUS SKILL & ACCURACY BADGES (Awarded alongside the 7 Predefined Recognitions)"],
  [
    "Bonus A",
    "Powerplay Prophet",
    "REC_BONUS_PP_PROPHET",
    "Prediction Master",
    "User achieved 100% accuracy on all predictions resolved in the 6 overs (Min 2 predictions).",
    "If only 1 prediction resolved, requires correct outcome on that call.",
    "🎯 POWERPLAY PROPHET! Flawless vision! 100% correct prediction accuracy.",
    "+25 SXPs",
    "Over 6 (Innings 1 & 2)",
    "/images/badges/predictionl4.png"
  ],
  [
    "Bonus B",
    "Sharp Shooter",
    "REC_BONUS_SHARP_SHOOTER",
    "Prediction Master",
    "User correctly predicted exact score band (e.g. 65-79 or 90+) or exact wicket over.",
    "Eligible for any user with at least 1 correct score band prediction.",
    "🏹 SHARP SHOOTER! Bullseye! You nailed the exact score band call.",
    "+15 SXPs",
    "Over 6, 12, 18, End",
    "/images/badges/predictionl3.png"
  ],
  [
    "Bonus C",
    "Streak Master",
    "REC_BONUS_STREAK_MASTER",
    "Prediction Master",
    "User has 2 or more consecutive correct prediction calls active.",
    "Carries forward across innings and phases.",
    "🔥 STREAK MASTER! You're on fire! 2+ correct predictions in a row.",
    "+15 SXPs",
    "Over 6, 12, 18, End",
    "/images/badges/trivial3.png"
  ]
];

// ─── TAB 7: End of Match Recap & SXP Summary ────────────────────────────────
const tab7Data = [
  ["END OF MATCH RECAP & SXP SUMMARY SPECIFICATION"],
  ["Recap Module", "Metric / Display Item", "User Value Example (Abhay)", "User Value Example (Suzy)", "User Value Example (Rohan)", "Calculation Formula / Rule"],
  ["Match Result Header", "Final Score & Outcome", "India won by 4 wickets (230/6 in 19.4 ov)", "India won by 4 wickets (230/6 in 19.4 ov)", "India won by 4 wickets (230/6 in 19.4 ov)", "Verified Official Match Scorecard"],
  ["Participation Scorecard", "Total Engagements Encountered", "20", "20", "20", "COUNT(engagements_served_in_match)"],
  ["Participation Scorecard", "Total Prompts Participated In", "18", "16", "9", "COUNT(user_votes + user_predictions)"],
  ["Participation Scorecard", "Participation Rate %", "90.0%", "80.0%", "45.0%", "(Participated / Encountered) * 100"],
  ["Prediction Performance", "Total Predictions Made", "8", "10", "4", "COUNT(user_predictions_submitted)"],
  ["Prediction Performance", "Correct Predictions Won", "5", "8", "2", "COUNT(predictions_where_user_won)"],
  ["Prediction Performance", "Prediction Accuracy Rate %", "62.5%", "80.0%", "50.0%", "(Correct_Predictions / Total_Predictions) * 100"],
  ["Social Impact", "Comments & Replies Posted", "12", "3", "0", "COUNT(user_comments_in_match)"],
  ["Social Impact", "Likes Received on Comments", "24", "6", "0", "SUM(likes_on_user_comments)"],
  ["Social Impact", "Replies Generated by User Takes", "9", "2", "0", "SUM(replies_to_user_comments)"],
  ["SXP Ledger", "Base Participation SXPs", "36 SXPs (18 x 2)", "32 SXPs (16 x 2)", "18 SXPs (9 x 2)", "Participated_Count * 2 SXPs"],
  ["SXP Ledger", "Prediction Accuracy Bonus SXPs", "50 SXPs (5 x 10)", "80 SXPs (8 x 10)", "20 SXPs (2 x 10)", "Correct_Predictions_Count * 10 SXPs"],
  ["SXP Ledger", "Social Engagement Bonus SXPs", "12 SXPs (Comments + Likes)", "5 SXPs", "0 SXPs", "MIN(5, comments) + FLOOR(likes / 5) * 5"],
  ["SXP Ledger", "6-Over Milestone Recognition Badges", "30 SXPs (Over 6, 12, 18 Badges)", "35 SXPs (Over 6, 12, 18 Badges)", "20 SXPs (Loyal Companion Badges)", "SUM(SXP values of all awarded checkpoint badges)"],
  ["SXP Ledger", "Winner Prediction Correct Bonus", "+10 SXPs", "+10 SXPs", "+10 SXPs", "If Predicted Winning Team == India (+10 SXPs)"],
  ["SXP Ledger", "TOTAL MATCH SXPs EARNED", "138 SXPs", "162 SXPs", "68 SXPs", "SUM of all SXP categories for the match"],
  ["Recognitions Unlocked", "Phase Badges Earned", "Highest Liked, Highest Comments, Loyal Companion", "Highest Viewed, Most Interacted, Powerplay Prophet", "Interacted in 3/5 Posts, Starter, Matchday Witness", "List of all badges unlocked in match session"],
  ["Ladder Progression", "Feature Badge Ladder Level-Up", "Comments Ladder -> Level 2 ('Conversationalist')", "Predictions Ladder -> Level 3 ('Oracle')", "Predictions Ladder -> Level 1 ('Predictor')", "Checked against `CONFIG#THRESHOLDS` table in DynamoDB"],
  ["Community Voice", "Fan Player of the Match Vote", "Sanju Samson (67 off 33)", "Sanju Samson (67 off 33)", "Sanju Samson (67 off 33)", "Fan community poll separate from Official Award"],
  ["Official Award", "Official Player of the Match", "Sanju Samson (67 off 33)", "Sanju Samson (67 off 33)", "Sanju Samson (67 off 33)", "Verified Official Match Award"],
  ["Next Match Return Hook", "2nd T20I (24 Oct, Christchurch)", "Streak carried forward (1 Match); 1-tap reminder set", "Streak carried forward (1 Match); 1-tap reminder set", "1-tap reminder set; streak started", "Preserves user loyalty, streak counter, and SXP wallet balance"]
];

// ─── TAB 8: KPIs, Instrumentation & Telemetry ───────────────────────────────
const tab8Data = [
  ["KPIS, INSTRUMENTATION & DATA TELEMETRY SPECIFICATION"],
  ["Telemetry Event Name", "Trigger Timing", "Payload / Event Properties", "Backend Destination", "Target Metric / KPI", "Product Health Benchmark"],
  [
    "moment_detected",
    "When live cricket event occurs",
    "{ match_id, innings, over, ball, event_type: 'WICKET'|'MILESTONE'|'OVER_END', score, source: 'cricinfo'|'admin' }",
    "DynamoDB / CloudWatch",
    "Event Coverage & Ingestion Latency",
    "< 2.0s from live telecast"
  ],
  [
    "engagement_card_served",
    "When engagement card renders on fan screen",
    "{ user_id, engagement_id, match_id, type: 'poll'|'prediction', timer_duration_sec: 240, placement: 'overlay', priority: 1 }",
    "DynamoDB SocialAndContent",
    "Card Delivery Rate & Reach",
    "> 95% of active match sessions"
  ],
  [
    "fan_action_voted",
    "When fan submits vote or prediction choice",
    "{ user_id, engagement_id, selected_option_id, time_to_vote_sec, timer_remaining_sec, match_phase }",
    "DynamoDB SocialAndContent / Firestore",
    "Action Rate & Voting Velocity",
    "> 60% of served fans vote"
  ],
  [
    "fan_comment_posted",
    "When fan submits discussion comment",
    "{ user_id, engagement_id, comment_id, text_length, parent_comment_id }",
    "DynamoDB SocialAndContent",
    "Social Density & Community Participation",
    "> 15% of voters comment"
  ],
  [
    "fan_comment_liked",
    "When fan toggles like/roar on comment",
    "{ user_id, comment_id, engagement_id, action: 'like'|'unlike' }",
    "DynamoDB SocialAndContent",
    "Social Loop & Viral Heat",
    "> 30% of comments receive likes"
  ],
  [
    "timer_countdown_expired",
    "When 4-minute (240s) countdown timer reaches 00:00",
    "{ engagement_id, total_votes_at_expiry, auto_locked: true, expired_at: 240000 }",
    "DynamoDB & Analytics",
    "4-Minute Timer Expiry Compliance",
    "100% auto-locked at 240s"
  ],
  [
    "prediction_locked",
    "When cutoff reached (timer expiry or early event cutoff)",
    "{ engagement_id, locked_at, total_predictions_locked, lock_reason: 'timer_expired_4m'|'early_event_cutoff' }",
    "DynamoDB & Firestore",
    "Fairness & Anti-Cheat Compliance",
    "100% locked before outcome"
  ],
  [
    "floating_notification_shown",
    "When delayed prediction resolves & card is outside viewport",
    "{ engagement_id, user_id, overs_delayed: 3, card_anchor_id: '#post-eng_003' }",
    "Client Analytics / PostHog",
    "Delayed Outcome Notification Impression Rate",
    "100% of out-of-viewport resolutions"
  ],
  [
    "floating_notification_clicked",
    "When fan clicks floating notification to jump to post",
    "{ engagement_id, user_id, time_to_click_sec, scroll_distance_px }",
    "Client Analytics / PostHog",
    "Jump-to-Post Click-Through Rate",
    "> 65% CTR on floating notifications"
  ],
  [
    "prediction_resolved",
    "When admin/feed reveals outcome",
    "{ engagement_id, winning_choice_id, total_winners, total_losers, sxp_payout_total }",
    "DynamoDB GamificationAndWallet",
    "Settlement Freshness & Accuracy",
    "< 30s after event confirms"
  ],
  [
    "checkpoint_recognition_awarded",
    "At Over 6.0, 12.0, 18.0, and Innings End",
    "{ user_id, phase: 'OVER_6', badge_id: 'REC_05_THREE_OF_FIVE_POSTS', rank: 5, sxp_bonus: 10 }",
    "DynamoDB GamificationAndWallet / Firestore",
    "Inclusive Recognition Coverage",
    "100% of participants receive badge"
  ],
  [
    "recap_card_rendered",
    "When match ends and user views summary",
    "{ user_id, match_id, total_sxps, accuracy_pct, badges_unlocked_count }",
    "Analytics / PostHog / Mixpanel",
    "Recap Completion & Pride Share Rate",
    "> 75% of session users"
  ],
  [
    "next_match_reminder_toggled",
    "When user opts into next fixture preview",
    "{ user_id, next_match_id: 'nz_ind_2nd_t20i', user_streak: 1 }",
    "Firestore UserPreferences",
    "Match-to-Match Retention Loop",
    "> 40% opt-in rate"
  ]
];

// ─── TAB 9: Upcoming Match Live Operations Playbook ─────────────────────────
const tab9Data = [
  ["LIVE MATCH OPERATIONS PLAYBOOK FOR UPCOMING MATCHES"],
  ["Purpose", "Operational guide for testing and running real-time second screen experiences with 4-Minute Timers during upcoming live matches."],
  ["Target Users", "Admin Operators, Content Curators, Community Moderators, QA Testers"],
  ["Core Standard", "Every single Prediction and Poll has a strict 4-Minute (240s) Active Countdown Timer."],
  ["Dynamic Archetypes", "DRS Reviews, Wickets/Collapses, Milestones, Rain/DLS, Delayed Resolutions, Checkpoints"],
  [""],
  ["1. DYNAMIC CRICKET EVENT PROTOCOLS (WHAT ADMIN DOES WHEN KEY MOMENTS OCCUR)"],
  ["Key Sporting Event", "Cricket Context / Trigger", "Immediate Admin Action", "Engagement Card to Push", "Lock & Resolution Rule (4-Min Timer)", "Edge Case & Safety Rule"],
  [
    "DRS Referral: LBW / Caught Behind",
    "Batter or fielding captain signals DRS review (LBW, caught behind, faint edge).",
    "1. Freeze any active live prediction immediately. 2. Push DRS Controversial Pulse Poll within 10 seconds.",
    "Poll: 'DRS Referral! Was that Out or Not Out?' (A: Out | B: Not Out | C: Umpire's Call)",
    "Standard 4-Min Timer (or auto-locks when 3rd Umpire begins ball tracking / UltraEdge). Resolves when TV signals.",
    "CRITICAL: Never reveal outcome based on TV commentator speculation. Only settle when 3rd umpire signals OUT/NOT OUT."
  ],
  [
    "DRS Controversy: Boundary Rope Touch",
    "Fielder attempts boundary catch/stop; umpire checks if foot touched rope.",
    "Push Controversial Touch Poll: 'Six or Spectacular Save? What is your call?'",
    "Poll: 'Boundary Rope Check! Six or Out?' (A: Clean Catch/Save | B: Six Runs / Boundary)",
    "Standard 4-Min Timer (or locks before replay confirms boundary contact). Instant % split.",
    "Instant high debate; fans flood comments. Upvoting active."
  ],
  [
    "Wicket: Shock Dismissal / Captain Out",
    "Key batter or captain dismissed early or for a duck.",
    "Push Wicket Reaction Pulse: 'Huge wicket! Does {{bowling_team}} now have the upper hand?'",
    "Poll: 'Wicket! Can {{batting_team}} recover or is a collapse coming?' (A: Rebuild safely | B: Counterattack)",
    "Standard 4-Min Timer (locks at 00:00 or start of next over). Resolves immediately.",
    "Deduplication: Automatically dismisses any pending general over-end card."
  ],
  [
    "Wicket Cluster / Mini-Collapse",
    "2 wickets fall within 1 over (e.g. 115/1 becomes 117/3).",
    "SUPPRESS all minor prompts. Launch 1 High-Stakes Tactical Card.",
    "Poll: 'Collapse Alert! 2 wickets in 4 balls. What is the smartest strategy?' (A: Anchor down | B: Attack boundaries)",
    "Standard 4-Min Timer (locks at 00:00).",
    "Avoids spamming user with multiple prompts; focuses community energy on 1 high-tension debate."
  ],
  [
    "Team Milestone: 50 / 100 / 150 / 200",
    "Batting team reaches landmark score (e.g. 50 in PP, 100 in 10 ov).",
    "Push Milestone Call + Next Phase Prediction.",
    "Prediction: '100 up! What will be {{batting_team}} final total score band?' (A: <175 | B: 175-194 | C: 195-214 | D: 215+)",
    "Standard 4-Min Timer: Voting strictly open for 4 minutes, then locks! Resolves at Innings End (Over 20.0).",
    "DELAYED RESOLUTION: Will trigger Floating Notification ('Jump to Post') at Innings End because post will scroll up!"
  ],
  [
    "Batter Individual Milestone (50 / 100)",
    "Batter reaches 50 or 100 runs in high strike rate.",
    "Push Batter Salute & Ceiling Prediction.",
    "Prediction: '{{batter}} reaches 50! How many will they score today?' (A: 50-69 | B: 70-89 | C: 90+)",
    "Standard 4-Min Timer (voting open for 4 mins). Resolves when batter is dismissed or innings ends.",
    "Triggers Floating Notification if resolved >2 overs later."
  ],
  [
    "Boundary Burst: 20+ Runs in an Over",
    "Batter hits 3+ boundaries in an over, swinging match tempo.",
    "Push Momentum Meter Poll: 'Carnage! 22 runs off the over. Who is feeling the heat?'",
    "Poll: 'Momentum Swing! Will {{bowling_team}} bounce back next over?' (A: Yes, wicket coming | B: No, onslaught continues)",
    "Standard 4-Min Timer (locks at 00:00).",
    "Captures explosive adrenaline in the room."
  ],
  [
    "Drinks Break / Strategic Timeout",
    "Official 2.5-minute tactical break at Over 9.6.",
    "Push In-Depth Mid-Innings Debate Card.",
    "Poll: 'Drinks Break: What must {{bowling_team}} do to restrict {{batting_team}} under 200?'",
    "Standard 4-Min Timer (fans can continue debating even as play resumes).",
    "Gives fans 4 full minutes to comment, debate, and upvote."
  ],
  [
    "Over 6, 12, 18 Checkpoints",
    "End of Overs 6, 12, 18, and Innings End.",
    "Trigger Batch Recognition Engine across all active room participants.",
    "RECOGNITION CAROUSEL: Evaluates the 7 Predefined Recognitions.",
    "Automatic batch calculation in <1 second.",
    "GUARANTEE: 100% of participants receive recognition (e.g. 3/5 posts, 1-2 posts, or active witness)."
  ],
  [
    "Rain Delay / DLS Interruption",
    "Match stopped due to rain or bad light; overs may be reduced.",
    "1. Freeze all live predictions. 2. If overs reduced, void obsolete predictions and refund points. 3. Push DLS Chase Poll.",
    "Poll: 'Rain Delay! Revised DLS target coming. Does rain help chasing or defending team?' (A: Chaser | B: Defender)",
    "Standard 4-Min Timer. Unsettled score-band predictions become `status: 'void'`. New DLS target prediction opens.",
    "Protects user SXPs from unfair cancellations."
  ],
  [
    "Match Climax: Final 6 Balls",
    "12 to 20 runs needed in the final over of the match.",
    "Push Climax Tension Poll before Over 19.1.",
    "Poll: 'Final Over Thriller! {{runs_needed}} needed from 6 balls. Who wins?' (A: {{batting_team}} | B: {{bowling_team}})",
    "Standard 4-Min Timer (or locks at winning moment).",
    "Peak engagement velocity of the entire second screen experience."
  ],
  [
    "Super Over / Match Tied",
    "Scores level after 20 overs each; match goes to Super Over.",
    "Trigger Super Over Blitz Mode.",
    "Prediction: 'Super Over! Who wins the tie-breaker?' + 'How many runs will be scored in Super Over?'",
    "Standard 4-Min Timer (or locks at first ball of Super Over). Resolves at end of Super Over.",
    "Instant high-stakes +20 SXP bonus."
  ],
  [""],
  ["2. PARAMETERIZED ADMIN PROMPT LIBRARY (READY-TO-USE WITH 4-MIN TIMERS)"],
  ["Template ID", "Match Phase", "Trigger Category", "Prompt Question (with {{placeholders}})", "Option A", "Option B", "Option C", "Option D", "Timer Duration", "SXP Value"],
  [
    "TPL_PRE_TOSS",
    "Pre-Match",
    "Toss",
    "{{toss_winner}} won the toss and elected to {{decision}}. Was this the right call?",
    "Smart tactical call",
    "Risky decision",
    "Neutral / 50-50",
    "-",
    "4 Minutes (240s)",
    "+2 SXPs"
  ],
  [
    "TPL_PP_SCORE",
    "Powerplay",
    "Over 3 End",
    "Where will {{batting_team}} finish at the end of 6 overs (Powerplay)?",
    "Under 45 runs",
    "45 to 59 runs",
    "60 to 74 runs",
    "75+ runs",
    "4 Minutes (240s)",
    "+2 Base, +10 Bonus"
  ],
  [
    "TPL_DRS_LBW",
    "Live Play",
    "DRS Referral",
    "DRS CHECK! Was {{batter}} OUT or NOT OUT on that LBW referral?",
    "OUT (Clean dismiss)",
    "NOT OUT (Missing)",
    "Umpire's Call",
    "-",
    "4 Minutes (240s)",
    "+2 SXPs"
  ],
  [
    "TPL_DRS_EDGE",
    "Live Play",
    "DRS Referral",
    "ULTRAEDGE CHECK! Did {{batter}} edge that delivery?",
    "Clear Spike (OUT)",
    "No Edge (NOT OUT)",
    "Too close to call",
    "-",
    "4 Minutes (240s)",
    "+2 SXPs"
  ],
  [
    "TPL_WICKET_REACT",
    "Live Play",
    "Wicket",
    "{{batter}} dismissed for {{runs_scored}}! How does this change the match?",
    "Big momentum shift",
    "Small bump, still ahead",
    "Even game now",
    "-",
    "4 Minutes (240s)",
    "+2 SXPs"
  ],
  [
    "TPL_COLLAPSE",
    "Live Play",
    "Wicket Cluster",
    "WICKET CLUSTER! {{batting_team}} lose 2 quick wickets. What is the best strategy?",
    "Rebuild with singles",
    "Keep counterattacking",
    "-",
    "-",
    "4 Minutes (240s)",
    "+2 SXPs"
  ],
  [
    "TPL_MID_TOTAL",
    "Middle Overs",
    "Over 10 Milestone",
    "100 on the board! What will be {{batting_team}} final 1st innings total score band?",
    "Below 180",
    "180 to 199",
    "200 to 219",
    "220+",
    "4 Minutes (240s)",
    "+2 Base, +10 Bonus"
  ],
  [
    "TPL_DEATH_BURST",
    "Death Overs",
    "Over 15 End",
    "Death overs are here! How many runs will be scored in the final 5 overs (16-20)?",
    "Under 45 runs",
    "45 to 59 runs",
    "60 to 75 runs",
    "76+ runs",
    "4 Minutes (240s)",
    "+2 Base, +10 Bonus"
  ],
  [
    "TPL_CHASE_WINNER",
    "Innings Break",
    "Target Set",
    "{{chasing_team}} need {{target}} runs to win from 120 balls. Who takes the victory?",
    "{{chasing_team}} chase it down",
    "{{defending_team}} defend total",
    "-",
    "-",
    "4 Minutes (240s)",
    "+2 Base, +10 Bonus"
  ],
  [
    "TPL_CLIMAX_OVER",
    "Late Chase",
    "Over 17 End",
    "Down to the wire! In which over will the winning runs be hit?",
    "Over 18 (17.1-18.0)",
    "Over 19 (18.1-19.0)",
    "Last Over (19.1-20.0)",
    "Super Over / Defended",
    "4 Minutes (240s)",
    "+2 Base, +10 Bonus"
  ],
  [
    "TPL_TURNING_PT",
    "Post-Match",
    "Result",
    "MATCH OVER! What was the single most decisive turning point of the game?",
    "Top batter's milestone",
    "Key wicket breakthrough",
    "Powerplay dominance",
    "Death overs execution",
    "4 Minutes (240s)",
    "+2 SXPs"
  ],
  [
    "TPL_FAN_POTM",
    "Post-Match",
    "Player of Match",
    "Fan Player of the Match: Who was your standout performer today?",
    "{{top_performer_1}}",
    "{{top_performer_2}}",
    "{{top_performer_3}}",
    "{{top_performer_4}}",
    "4 Minutes (240s)",
    "+2 SXPs"
  ],
  [""],
  ["3. OPERATIONAL TESTING CHECKLIST FOR UPCOMING MATCH"],
  ["Checklist Item", "Execution Step", "Validation Criteria", "Responsible Role"],
  ["4-Minute Timer Validation", "Verify every served card has a ticking 04:00 timer that auto-locks at 00:00.", "Card shows visual timer ring; locks at 240s.", "Frontend QA"],
  ["Pre-Match Readiness", "Pre-load templates TPL_PRE_TOSS and TPL_PP_SCORE with team names and 4-min timer.", "Cards exist in admin draft queue with correct parameters.", "Admin Operator"],
  ["DRS Readiness", "Have DRS Pulse Template pinned in Admin Panel for rapid 1-click trigger.", "Card launches within <10s of umpire referral signal on TV.", "Live Operator"],
  ["Delayed Outcome Verification", "Resolve Over 3 prediction at Over 6. Verify that Floating In-Room Notification displays.", "Floating toast appears: 'Result Revealed! Tap to jump'. Clicking scrolls to post.", "QA / Tester"],
  ["6-Over Recognitions Validation", "At Over 6.0, trigger batch recognition evaluation.", "Verify that 100% of participants receive a badge (including 3/5 posts and baseline).", "Gamification Lead"],
  ["End of Match Recap Validation", "At winning runs, settle final winner prediction and render match recap screen.", "Recap displays audited SXPs, prediction accuracy %, and next match reminder.", "Product Lead"]
];

// ─── HELPER: Convert Array of Arrays to Sheet with Auto Column Widths ──────
function createStyledSheet(data) {
  const ws = XLSX.utils.aoa_to_sheet(data);
  const colWidths = [];

  for (let r = 0; r < data.length; r++) {
    for (let c = 0; c < (data[r] ? data[r].length : 0); c++) {
      const cellValue = data[r][c] != null ? String(data[r][c]) : "";
      const len = Math.min(75, Math.max(12, cellValue.length + 3));
      if (!colWidths[c] || colWidths[c] < len) {
        colWidths[c] = len;
      }
    }
  }

  ws["!cols"] = colWidths.map((w) => ({ wch: w }));
  return ws;
}

// ─── APPEND ALL 9 TABS ──────────────────────────────────────────────────────
XLSX.utils.book_append_sheet(wb, createStyledSheet(tab1Data), "1. Start Here & Overview");
XLSX.utils.book_append_sheet(wb, createStyledSheet(tab2Data), "2. Match Facts & Triggers");
XLSX.utils.book_append_sheet(wb, createStyledSheet(tab3Data), "3. Loop Log (Moments)");
XLSX.utils.book_append_sheet(wb, createStyledSheet(tab4Data), "4. Fan Journeys");
XLSX.utils.book_append_sheet(wb, createStyledSheet(tab5Data), "5. Prompts & Rules Engine");
XLSX.utils.book_append_sheet(wb, createStyledSheet(tab6Data), "6. Predefined Recognitions");
XLSX.utils.book_append_sheet(wb, createStyledSheet(tab7Data), "7. End of Match Recap");
XLSX.utils.book_append_sheet(wb, createStyledSheet(tab8Data), "8. KPIs & Telemetry");
XLSX.utils.book_append_sheet(wb, createStyledSheet(tab9Data), "9. Upcoming Match Playbook");

// ─── WRITE WORKBOOK TO DISK ─────────────────────────────────────────────────
const outPath = path.resolve(process.cwd(), "Sportsfan_SecondScreen_Workflow_Matrix.xlsx");
XLSX.writeFile(wb, outPath);

console.log("==================================================================");
console.log(" EXCEL WORKBOOK GENERATED SUCCESSFULLY!");
console.log(` File Path: ${outPath}`);
console.log(" Tabs Created (9 Total):");
console.log("   1. Start Here & Overview (with 4-Minute Timer Standard)");
console.log("   2. Match Facts & Triggers (Reference Match Baseline)");
console.log("   3. Loop Log (Moments & 4-Min Countdown Rules)");
console.log("   4. Fan Journeys (Abhay vs Suzy vs Rohan)");
console.log("   5. Prompts & Rules Engine (4-Min Auto-Lock & Jump-to-Post Tech Spec)");
console.log("   6. 7 Predefined Recognitions (100% Inclusive Engine)");
console.log("   7. End of Match Recap & SXP Ledger");
console.log("   8. KPIs & Telemetry (4-Min Expiry & Floating Toast Events)");
console.log("   9. Upcoming Match Playbook (4-Min Timer Templates, DRS & Checklist)");
console.log("==================================================================");
