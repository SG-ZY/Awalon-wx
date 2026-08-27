const AVALON_RULE_CONFIG = require('../../data/avalon_rule_config')
const ROLE_DEFINITIONS = AVALON_RULE_CONFIG.roleDefinitions
const ROLE_LIBRARY = Object.keys(ROLE_DEFINITIONS).reduce((library, id) => ({ ...library, [ROLE_DEFINITIONS[id].key]: { ...ROLE_DEFINITIONS[id], id } }), {})
const ROLE_SKILL_CONFIG = AVALON_RULE_CONFIG.skills
const SKILL_STORAGE_KEY = 'avalon-role-skill-states'
const ACTIVE_GAME_STORAGE_KEY = 'avalon-active-game'

const ROLE_ID_TO_KEY = Object.keys(ROLE_DEFINITIONS).reduce((keys, id) => ({ ...keys, [id]: ROLE_DEFINITIONS[id].key }), {})
const ROLE_SKILL_BY_ROLE = Object.keys(ROLE_LIBRARY).reduce((skills, key) => ROLE_LIBRARY[key].skillType ? { ...skills, [key]: ROLE_LIBRARY[key].skillType } : skills, {})
const RULES_BY_PLAYER_COUNT = AVALON_RULE_CONFIG.rules.reduce((rules, rule) => ({ ...rules, [rule.playerCount]: rule }), {})
const MIN_PLAYER_COUNT = Math.min(...AVALON_RULE_CONFIG.rules.map(rule => rule.playerCount))
const MAX_PLAYER_COUNT = Math.max(...AVALON_RULE_CONFIG.rules.map(rule => rule.playerCount))
const getRule = (count, ninePlayerEvilCount = 3) => {
  const rule = RULES_BY_PLAYER_COUNT[count] || RULES_BY_PLAYER_COUNT[DEFAULT_PLAYER_COUNT]
  const variant = count === 9 && Number(ninePlayerEvilCount) === 4 ? rule.evilVariants && rule.evilVariants.four : null
  return variant ? { ...rule, roles: variant.roles } : rule
}
const getRuleRoles = (count, ninePlayerEvilCount) => getRule(count, ninePlayerEvilCount).roles.flatMap(role => Array.from({ length: role.count }, () => ROLE_ID_TO_KEY[role.id]))

const KNIGHT_AVATAR_TONES = ['rose', 'amber', 'jade', 'azure', 'violet', 'coral', 'mint', 'indigo', 'peach']
const DEFAULT_KNIGHT_NAMES = ['上官', '小丝', '超甜', 'Sheng', '8 ye', '点奶茶', '甜甜圈']
const makePlayers = (count, previous = []) => Array.from({ length: count }, (_, index) => ({
  id: index + 1, name: previous[index] ? previous[index].name : (DEFAULT_KNIGHT_NAMES[index] || `骑士 ${index + 1}`),
  avatarUrl: previous[index] ? previous[index].avatarUrl : '', avatarTone: KNIGHT_AVATAR_TONES[index % KNIGHT_AVATAR_TONES.length], password: previous[index] && previous[index].password !== undefined ? previous[index].password : String(index + 1), joined: previous[index] ? previous[index].joined : true, role: null, roleName: '', camp: '', symbol: '', ability: '', effect: '', vision: ''
}))
const ROLE_PREVIEW_COLUMNS = 4
const makeRolePreview = (count, ninePlayerEvilCount) => {
  const evilPreviewOrder = { MORGANA: 0, ASSASSIN: 1, OBERON: 2, MINION: 3, MORDRED: 4 }
  return getRule(count, ninePlayerEvilCount).roles.slice().sort((left, right) => {
    if (left.camp !== 'EVIL' || right.camp !== 'EVIL') return 0
    return evilPreviewOrder[left.id] - evilPreviewOrder[right.id]
  }).map(roleConfig => {
  const role = ROLE_ID_TO_KEY[roleConfig.id]
  const definition = ROLE_LIBRARY[role]
  return { id: role, name: definition.name, countLabel: roleConfig.count > 1 ? `×${roleConfig.count}` : '', camp: definition.camp, symbol: definition.symbol, ability: definition.ability, effect: definition.effect }
  })
}
const makeRoleRows = cards => {
  return Array.from({ length: Math.ceil(cards.length / ROLE_PREVIEW_COLUMNS) }, (_, index) => ({ cards: cards.slice(index * ROLE_PREVIEW_COLUMNS, (index + 1) * ROLE_PREVIEW_COLUMNS) }))
}
const shuffle = list => {
  const shuffled = list.slice()
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const value = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = value
  }
  return shuffled
}
const nextPlayerId = (id, count) => id === count ? 1 : id + 1
//wick 20260808@ Prioritize the least-selected first leader while preserving randomness on ties {
const randomPriorityPlayerIdExcept = (players, scores, excludedId) => {
  const candidates = players.filter(player => player.id !== excludedId)
  const eligible = candidates.length ? candidates : players
  const highestScore = Math.max(...eligible.map(player => Number(scores[player.id]) || 0))
  const priorityPool = eligible.filter(player => (Number(scores[player.id]) || 0) === highestScore)
  return priorityPool[Math.floor(Math.random() * priorityPool.length)].id
}
//wick 20260808@ Prioritize the least-selected first leader while preserving randomness on ties }
const SPEAKING_DIRECTIONS = ['顺时针', '逆时针']
const DEFAULT_PLAYER_COUNT = 7
const fourthMissionFailNeedForPlayerCount = count => count >= 7 ? 2 : 1
const assassinationMinutesForPlayerCount = count => count <= 6 ? 2 : (count <= 8 ? 3 : (count <= 10 ? 4 : 5))
const DEFAULT_ASSASSINATION_MINUTES = assassinationMinutesForPlayerCount(DEFAULT_PLAYER_COUNT)
const MIN_ASSASSINATION_MINUTES = 1
const MAX_ASSASSINATION_MINUTES = 10
const ASSASSINATION_SECONDS = DEFAULT_ASSASSINATION_MINUTES * 60
const formatAssassinationTime = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
const GAME_PHASE = { MISSION: 'MISSION', REVEAL: 'REVEAL', LAKE_CHECK: 'LAKE_CHECK', ASSASSINATION: 'ASSASSINATION', SETTLEMENT: 'SETTLEMENT' }
const gamePhaseForSubPhase = subPhase => {
  if (subPhase === 'phoneReveal') return GAME_PHASE.REVEAL
  if (subPhase === 'lakeSkill') return GAME_PHASE.LAKE_CHECK
  if (subPhase === 'assassinationCountdown' || subPhase === 'assassinate') return GAME_PHASE.ASSASSINATION
  if (subPhase === 'ended') return GAME_PHASE.SETTLEMENT
  return GAME_PHASE.MISSION
}
const latestRoleForSeat = (roleHistory, playerId) => {
  const history = roleHistory[playerId]
  return Array.isArray(history) ? history[history.length - 1] : history
}
const booleanTrailForSeat = (historyBySeat, playerId) => {
  const history = historyBySeat[playerId]
  return Array.isArray(history) ? history : (history ? [history] : [])
}
const isSpecialRole = role => (ROLE_LIBRARY[role] || {}).id !== 'LOYAL_SERVANT'
const dealRolesWithHistoryGuards = (roleKeys, players, roleHistory, specialRoleHistory, evilHistory, roleRerollEnabled, specialRoleRerollEnabled, evilTripleGuardEnabled) => {
  if (!roleRerollEnabled && !specialRoleRerollEnabled && !evilTripleGuardEnabled) return shuffle(roleKeys)
  const previousRoles = players.map(player => latestRoleForSeat(roleHistory, player.id))
  const specialTrails = players.map(player => booleanTrailForSeat(specialRoleHistory, player.id))
  const evilTrails = players.map(player => booleanTrailForSeat(evilHistory, player.id))
  const remaining = shuffle(roleKeys)
  const dealt = Array(players.length)
  const dealSeat = seatIndex => {
    if (seatIndex === players.length) return true
    const specialTrail = specialTrails[seatIndex]
    const evilTrail = evilTrails[seatIndex]
    const repeatedSpecialIsBlocked = role => specialRoleRerollEnabled && specialTrail.length >= 2 && specialTrail[specialTrail.length - 2] && specialTrail[specialTrail.length - 1] && isSpecialRole(role)
    const repeatedEvilIsBlocked = role => evilTripleGuardEnabled && evilTrail.length >= 2 && evilTrail[evilTrail.length - 2] && evilTrail[evilTrail.length - 1] && ROLE_LIBRARY[role].camp === 'evil'
    const candidates = shuffle(remaining).filter((role, index, roles) => (!roleRerollEnabled || role !== previousRoles[seatIndex]) && !repeatedSpecialIsBlocked(role) && !repeatedEvilIsBlocked(role) && roles.indexOf(role) === index)
    return candidates.some(role => {
      const roleIndex = remaining.indexOf(role)
      remaining.splice(roleIndex, 1)
      dealt[seatIndex] = role
      if (dealSeat(seatIndex + 1)) return true
      remaining.splice(roleIndex, 0, role)
      return false
    })
  }
  return dealSeat(0) ? dealt : shuffle(roleKeys)
}

Page({
  data: {
    phase: 'lobby', gamePhase: GAME_PHASE.MISSION, subPhase: 'team', playerCount: 7, minPlayerCount: MIN_PLAYER_COUNT, maxPlayerCount: MAX_PLAYER_COUNT, fourthQuestFailNeed: fourthMissionFailNeedForPlayerCount(DEFAULT_PLAYER_COUNT), assassinationMinutes: DEFAULT_ASSASSINATION_MINUTES, defaultAssassinationMinutes: DEFAULT_ASSASSINATION_MINUTES, missionPhoneVoting: true, ninePlayerEvilCount: 3, ninePlayerEvilMode: 'random', consecutiveRoleReroll: true, consecutiveSpecialRoleReroll: true, evilTripleGuardEnabled: Math.random() < .5, evilTripleGuardGameCount: 0, teamMode: 'offline',
    players: makePlayers(7), rolePreview: makeRolePreview(7), roleDetailOpen: false, roleDetail: {}, hostProfile: makePlayers(1)[0], roleHistory: {}, specialRoleHistory: {}, evilHistory: {}, seatPasswordOpen: false, passwordMode: 'setting', passwordSeatId: 0, passwordSeatName: '', passwordSeatAvatarTone: '', passwordSeatAvatarUrl: '', passwordDraft: '', joinedCount: 7, countdown: 3, selectedPlayerId: 0, selectedPlayer: null, identityUnlocked: false, roleVisible: false, identityCollapsed: false, identityCountdown: 0, identityViewedIds: [],
    goodRoleRows: makeRoleRows(makeRolePreview(7).filter(card => card.camp === 'good')), evilRoleRows: makeRoleRows(makeRolePreview(7).filter(card => card.camp === 'evil')), roleCardsExpanded: true, roomCreated: false,
    quests: [], questView: 'map', currentQuest: 0, goodScore: 0, evilScore: 0, winner: '', resultText: '', speakingDirection: '', leaderId: 1, firstLeaderId: 1, lastFirstLeaderId: 0,
    proposalTeam: [], voteQueue: [], voteStep: 0, voteCurrentNumber: 1, yesVotes: 0, noVotes: 0, rejectionCount: 0,
    missionQueue: [], missionStep: 0, missionCurrentNumber: 1, missionFails: 0, missionCards: [], missionVoteHistory: [], phoneVoterId: 0, phoneVotedIds: [], phoneMissionTeam: [], phoneTeamPickerOpen: false, phoneTeamPickerQuestIndex: 0, phoneTeamPickerLeaderId: 0, assassinationCountdown: ASSASSINATION_SECONDS, assassinationTimeText: formatAssassinationTime(ASSASSINATION_SECONDS), notice: '',
    leaderName: '', firstLeaderName: '', teamPlayers: [], teamCount: 0, currentQuestTeamSize: 0, roundNumber: 1, votePlayerName: '', missionPlayerName: '', missionCanFail: false, phoneVoterName: '', phoneMissionCanFail: false, phoneMissionPlayers: [],
    goodTargets: [], visionPlayers: [], roleRevealOpen: false, assassinationConfirmOpen: false, assassinationTarget: null, missionResultOpen: false, missionResultTitle: '', missionResultCopy: '', missionResultBombCount: 0, missionResultSeconds: 0, identityConfirmMode: '', manualMissionConfirmOpen: false, manualMissionResult: '', phoneVoteResetConfirmOpen: false, phoneVoteResetTargetId: 0,
    roleStates: {}, selectedSkillStatus: null, lakeSkillOpen: false, lakeReturnSubPhase: '', lakeSkillHolderName: '', lakeSkillTargets: [], lakeSkillResultOpen: false, lakeSkillResultTargetName: '', lakeSkillResultCamp: '', lakeSkillResultCopy: ''
  },

  onLoad() { if (!this.restoreActiveGame()) this.updateLobby(this.data.players) },
  onUnload() { clearInterval(this.countdownTimer); clearInterval(this.assassinationTimer); clearInterval(this.identityCollapseTimer); clearInterval(this.missionResultCountdownTimer); clearTimeout(this.missionResultTimer); this.stopPlayerCountRepeat(); this.stopAssassinationMinutesRepeat() },
  updateLobby(players) { this.setData({ players, hostProfile: players[0], joinedCount: players.filter(player => player.joined).length }) },
  createRoleStates(players) {
    return players.reduce((states, player) => {
      const skillType = ROLE_SKILL_BY_ROLE[player.role]
      if (!skillType || !ROLE_SKILL_CONFIG[skillType]) return states
      states[player.id] = { roleId: player.role, skillType, ownerId: player.id, holderId: player.id, state: JSON.parse(JSON.stringify(ROLE_SKILL_CONFIG[skillType].initialState)) }
      return states
    }, {})
  },
  persistRoleStates(roleStates) { try { wx.setStorageSync(SKILL_STORAGE_KEY, roleStates) } catch (error) {} },
  getSkillStatus(player, roleStates) {
    if (!player) return null
    const entry = Object.values(roleStates || {}).find(item => item.holderId === player.id)
    if (!entry) return null
    if (entry.skillType === 'LOYALTY_CHANGE') return { title: ROLE_SKILL_CONFIG[entry.skillType].title, detail: entry.state.fallen ? `忠诚值 ${entry.state.loyalty} · 已堕落为邪恶阵营` : `忠诚值 ${entry.state.loyalty} · 未堕落` }
    if (entry.skillType === 'CHECK_CAMP') return { title: ROLE_SKILL_CONFIG[entry.skillType].title, detail: `剩余 ${entry.state.remainingCount} 次 · 已查验 ${entry.state.checkedPlayers.length} 人` }
    return null
  },
  getPlayerVision(player) {
    const visionRule = (ROLE_LIBRARY[player.role] || {}).visionRule
    if (visionRule === 'EVIL_EXCEPT_MORDRED') return '你看见的邪恶阵营（莫德雷德除外）：'
    if (visionRule === 'MERLIN_OR_MORGANA') return '以下两人是梅林／莫甘娜：'
    if (visionRule === 'EVIL_TEAM_EXCEPT_OBERON') return '你的邪恶同伴：'
    if (visionRule === 'ISOLATED_EVIL') return '你独自潜伏：你不知道其他邪恶阵营，他们也不知道你。'
    return '请保密你的身份，用推理帮助所属阵营获胜。'
  },
  applySkillEvent(eventName, state, context) {
    const roleStates = JSON.parse(JSON.stringify(state.roleStates || {}))
    let players = state.players.slice()
    Object.keys(roleStates).forEach(key => {
      const entry = roleStates[key]
      const effects = ((ROLE_SKILL_CONFIG[entry.skillType] || {}).eventEffects || {})[eventName] || []
      effects.forEach(effect => {
        if (effect.type === 'adjustNumber') entry.state[effect.field] += effect.value
        if (effect.type === 'changeCampAtThreshold' && !entry.state[effect.flag] && entry.state[effect.field] <= effect.threshold) {
          entry.state[effect.flag] = true
          players = players.map(player => player.id === entry.ownerId ? { ...player, camp: effect.camp } : player)
        }
        if (effect.type === 'scheduleCampCheck' && entry.state.remainingCount > 0 && entry.state.nextTriggerMission === context.missionNumber) {
          entry.state.pending = true
          entry.state.triggerMission = context.missionNumber
        }
      })
    })
    players = players.map(player => ({ ...player, vision: this.getPlayerVision(player) }))
    return { players, roleStates }
  },
  gameView(state) {
    const currentQuest = state.quests[state.currentQuest] || { teamSize: 0 }
    const votePlayer = state.players.find(player => player.id === state.voteQueue[state.voteStep])
    const missionPlayer = state.players.find(player => player.id === state.missionQueue[state.missionStep])
    const phoneVoter = state.players.find(player => player.id === state.phoneVoterId)
    const missionVoteHistory = state.missionVoteHistory || []
    const lakeSkill = Object.values(state.roleStates || {}).find(item => item.skillType === 'CHECK_CAMP')
    const lakeHolder = lakeSkill ? state.players.find(player => player.id === lakeSkill.holderId) : null
    const roleRevealPlayers = state.players.slice().sort((left, right) => left.camp === right.camp ? left.id - right.id : left.camp === (state.winner === '邪恶阵营胜利' ? 'evil' : 'good') ? -1 : 1).map(player => {
      const playerVotes = missionVoteHistory.filter(vote => vote.playerId === player.id)
      const riddenQuestIds = new Set([...(playerVotes.map(vote => vote.round)), ...state.quests.filter(quest => (quest.riders || []).indexOf(player.id) >= 0).map(quest => quest.index)])
      const missionVoteItems = state.quests.filter(quest => quest.status).map(quest => {
        const vote = playerVotes.find(item => item.round === quest.index)
        const rider = riddenQuestIds.has(quest.index)
        return { label: `${quest.index}`, rider, bomb: rider && player.camp === 'evil' && vote && vote.card === 'fail' }
      })
      return { ...player, missionVoteSummary: missionVoteItems.filter(item => item.rider).map(item => item.bomb ? `${item.label} 💣` : item.label).join('、'), missionVoteItems }
    })
    const roleRevealGroups = ['good', 'evil'].sort((left, right) => left === (state.winner === '邪恶阵营胜利' ? 'evil' : 'good') ? -1 : right === (state.winner === '邪恶阵营胜利' ? 'evil' : 'good') ? 1 : 0).map(camp => ({ camp, title: camp === 'good' ? '好人阵营' : '邪恶阵营', players: roleRevealPlayers.filter(player => player.camp === camp) }))
    return {
      leaderName: (state.players.find(player => player.id === state.leaderId) || {}).name || '',
      firstLeaderName: (state.players.find(player => player.id === (state.firstLeaderId || state.leaderId)) || {}).name || '',
      teamPlayers: state.players.map(player => ({ ...player, picked: state.proposalTeam.indexOf(player.id) >= 0 })),
      teamCount: state.proposalTeam.length, currentQuestTeamSize: currentQuest.teamSize, currentQuestFailNeed: currentQuest.failNeed || 1, roundNumber: Math.min(state.currentQuest + 1, 5),
      questViewItems: state.quests.map(quest => {
        const votedRiders = missionVoteHistory.filter(vote => vote.round === quest.index).map(vote => state.players.find(player => player.id === vote.playerId)).filter(Boolean)
        const assignedRiders = (quest.riders || []).map(id => state.players.find(player => player.id === id)).filter(Boolean)
        return { ...quest, riders: (assignedRiders.length ? assignedRiders : votedRiders).map(player => ({ ...player, isLeader: quest.leaderId === player.id })) }
      }),
      votePlayerName: votePlayer ? votePlayer.name : '', missionPlayerName: missionPlayer ? missionPlayer.name : '',
      missionCanFail: missionPlayer ? missionPlayer.camp === 'evil' : false, phoneVoterName: phoneVoter ? phoneVoter.name : '', phoneMissionCanFail: !!phoneVoter && phoneVoter.camp === 'evil', phoneMissionPlayers: state.players.map(player => ({ ...player, missionVoted: state.phoneVotedIds.indexOf(player.id) >= 0, missionEligible: true })), canAssassinate: state.teamMode === 'offline' || state.selectedPlayerId === 1 || !!(state.selectedPlayer && state.selectedPlayer.role === 'assassin'),
      phoneTeamPickerPlayers: state.players.map(player => ({ ...player, picked: (state.phoneMissionTeam || []).indexOf(player.id) >= 0, isLeader: state.phoneTeamPickerLeaderId === player.id })), phoneTeamPickerCount: (state.phoneMissionTeam || []).length, phoneTeamPickerSize: ((state.quests || []).find(quest => quest.index === state.phoneTeamPickerQuestIndex) || currentQuest).teamSize,
      roleRevealCompact: state.players.length >= 5, roleRevealMedium: false, roleRevealLarge: false, roleRevealDense: state.players.length >= 14, goodTargets: state.players.filter(player => player.camp === 'good'),
      selectedSkillStatus: this.getSkillStatus(state.selectedPlayer, state.roleStates), lakeSkillHolderName: lakeHolder ? lakeHolder.name : '', lakeSkillTargets: lakeSkill ? state.players.filter(player => player.id !== lakeSkill.holderId && lakeSkill.state.checkedPlayers.indexOf(player.id) < 0) : [],
      roleRevealPlayers, roleRevealGroups
    }
  },
  setGame(changes, callback) {
    const gamePhase = changes.gamePhase || gamePhaseForSubPhase(changes.subPhase || this.data.subPhase)
    const state = { ...this.data, ...changes, gamePhase }
    if (changes.roleStates) this.persistRoleStates(changes.roleStates)
    this.persistActiveGame(state)
    this.setData({ ...changes, gamePhase, ...this.gameView(state) }, callback)
  },
  persistActiveGame(state) {
    try {
      if (state.phase !== 'game' || state.winner) return wx.removeStorageSync(ACTIVE_GAME_STORAGE_KEY)
      const snapshot = { ...state, selectedPlayer: null, selectedPlayerId: 0, identityUnlocked: false, roleVisible: false, identityCollapsed: true, roleDetailOpen: false, missionResultOpen: false, lakeSkillResultOpen: false, roleRevealOpen: false, assassinationConfirmOpen: false }
      wx.setStorageSync(ACTIVE_GAME_STORAGE_KEY, snapshot)
    } catch (error) {}
  },
  restoreActiveGame() {
    let snapshot
    try { snapshot = wx.getStorageSync(ACTIVE_GAME_STORAGE_KEY) } catch (error) { return false }
    if (!snapshot || snapshot.phase !== 'game' || !Array.isArray(snapshot.players) || !snapshot.players.length) return false
    const roleStates = snapshot.roleStates || {}
    const lakePending = Object.values(roleStates).some(entry => entry.skillType === 'CHECK_CAMP' && entry.state && entry.state.pending)
    const restoredSubPhase = lakePending ? 'lakeSkill' : snapshot.subPhase
    const players = snapshot.players.map((player, index) => ({ ...player, avatarTone: KNIGHT_AVATAR_TONES[index % KNIGHT_AVATAR_TONES.length] }))
    const restored = { ...this.data, ...snapshot, players, roleStates, gamePhase: lakePending ? GAME_PHASE.LAKE_CHECK : (snapshot.gamePhase || gamePhaseForSubPhase(restoredSubPhase)), selectedPlayer: null, selectedPlayerId: 0, identityUnlocked: false, roleVisible: false, identityCollapsed: true, lakeSkillOpen: lakePending, lakeSkillResultOpen: false, subPhase: restoredSubPhase, lakeReturnSubPhase: lakePending ? (snapshot.lakeReturnSubPhase || snapshot.subPhase) : '' }
    this.setData({ ...restored, ...this.gameView(restored) })
    return true
  },
  getVisionPlayers(player, players) {
    if (!player) return []
    const visionRule = (ROLE_LIBRARY[player.role] || {}).visionRule
    if (visionRule === 'EVIL_EXCEPT_MORDRED') return players.filter(item => item.camp === 'evil' && (ROLE_LIBRARY[item.role] || {}).id !== 'MORDRED')
    if (visionRule === 'MERLIN_OR_MORGANA') return players.filter(item => ['MERLIN', 'MORGANA'].indexOf((ROLE_LIBRARY[item.role] || {}).id) >= 0)
    if (visionRule === 'EVIL_TEAM_EXCEPT_OBERON') return players.filter(item => item.camp === 'evil' && (ROLE_LIBRARY[item.role] || {}).id !== 'OBERON' && item.id !== player.id)
    return []
  },
  setPlayerCount(count) {
    if (count === this.data.playerCount) return
    this.updateLobby(makePlayers(count, this.data.players))
    const ninePlayerEvilCount = count === 9 && this.data.ninePlayerEvilMode === 'random' ? (Math.random() < .5 ? 3 : 4) : this.data.ninePlayerEvilCount
    const rolePreview = makeRolePreview(count, ninePlayerEvilCount)
    const fourthQuestFailNeed = count === 9 && ninePlayerEvilCount === 3 ? 1 : fourthMissionFailNeedForPlayerCount(count)
    const assassinationMinutes = assassinationMinutesForPlayerCount(count)
    this.setData({ playerCount: count, ninePlayerEvilCount, fourthQuestFailNeed, assassinationMinutes, defaultAssassinationMinutes: assassinationMinutes, assassinationCountdown: assassinationMinutes * 60, assassinationTimeText: formatAssassinationTime(assassinationMinutes * 60), rolePreview, goodRoleRows: makeRoleRows(rolePreview.filter(card => card.camp === 'good')), evilRoleRows: makeRoleRows(rolePreview.filter(card => card.camp === 'evil')) })
  },
  changePlayerCount(event) {
    const count = Math.max(MIN_PLAYER_COUNT, Math.min(MAX_PLAYER_COUNT, this.data.playerCount + Number(event.currentTarget.dataset.step)))
    this.setPlayerCount(count)
  },
  startPlayerCountRepeat(event) {
    this.stopPlayerCountRepeat()
    const step = Number(event.currentTarget.dataset.step)
    this.playerCountRepeatTimer = setInterval(() => this.changePlayerCount({ currentTarget: { dataset: { step } } }), 100)
  },
  stopPlayerCountRepeat() { clearInterval(this.playerCountRepeatTimer); this.playerCountRepeatTimer = null },
  validatePlayerCount(event) {
    if (wx.hideKeyboard) wx.hideKeyboard()
    const value = String(event.detail.value || '').trim()
    if (!/^[0-9]+$/.test(value) || Number(value) < MIN_PLAYER_COUNT || Number(value) > MAX_PLAYER_COUNT) {
      this.updateLobby(makePlayers(DEFAULT_PLAYER_COUNT, this.data.players))
      this.setPlayerCount(DEFAULT_PLAYER_COUNT)
      return wx.showToast({ title: `请输入 ${MIN_PLAYER_COUNT} 至 ${MAX_PLAYER_COUNT} 的整数，已恢复为 ${DEFAULT_PLAYER_COUNT} 人`, icon: 'none' })
    }
    this.setPlayerCount(Number(value))
  },
  //wick 20260808@ Lock the fourth mission condition for both 9-player variants {
  setFourthQuestFailNeed(event) { if (this.data.playerCount < 7) this.setData({ fourthQuestFailNeed: Number(event.currentTarget.dataset.value) }) },
  //wick 20260808@ Lock the fourth mission condition for both 9-player variants }
  setNinePlayerEvilCount(event) {
    const ninePlayerEvilCount = Number(event.currentTarget.dataset.value)
    const rolePreview = makeRolePreview(9, ninePlayerEvilCount)
    this.setData({ ninePlayerEvilCount, ninePlayerEvilMode: 'manual', fourthQuestFailNeed: ninePlayerEvilCount === 3 ? 1 : 2, rolePreview, goodRoleRows: makeRoleRows(rolePreview.filter(card => card.camp === 'good')), evilRoleRows: makeRoleRows(rolePreview.filter(card => card.camp === 'evil')) })
  },
  randomizeNinePlayerEvilCount() {
    const ninePlayerEvilCount = Math.random() < .5 ? 3 : 4
    const rolePreview = makeRolePreview(9, ninePlayerEvilCount)
    this.setData({ ninePlayerEvilCount, ninePlayerEvilMode: 'random', fourthQuestFailNeed: ninePlayerEvilCount === 3 ? 1 : 2, rolePreview, goodRoleRows: makeRoleRows(rolePreview.filter(card => card.camp === 'good')), evilRoleRows: makeRoleRows(rolePreview.filter(card => card.camp === 'evil')) })
  },
  toggleMissionPhoneVoting() { this.setData({ missionPhoneVoting: !this.data.missionPhoneVoting }) },
  toggleConsecutiveRoleReroll() { this.setData({ consecutiveRoleReroll: !this.data.consecutiveRoleReroll }) },
  toggleConsecutiveSpecialRoleReroll() {
    const consecutiveSpecialRoleReroll = !this.data.consecutiveSpecialRoleReroll
    this.setData({ consecutiveSpecialRoleReroll, specialRoleHistory: consecutiveSpecialRoleReroll ? {} : this.data.specialRoleHistory })
  },
  setAssassinationMinutes(assassinationMinutes) {
    const assassinationSeconds = assassinationMinutes * 60
    this.setData({ assassinationMinutes, assassinationCountdown: assassinationSeconds, assassinationTimeText: formatAssassinationTime(assassinationSeconds) })
  },
  changeAssassinationMinutes(event) {
    const assassinationMinutes = Math.max(MIN_ASSASSINATION_MINUTES, Math.min(MAX_ASSASSINATION_MINUTES, this.data.assassinationMinutes + Number(event.currentTarget.dataset.step)))
    this.setAssassinationMinutes(assassinationMinutes)
  },
  startAssassinationMinutesRepeat(event) {
    this.stopAssassinationMinutesRepeat()
    const step = Number(event.currentTarget.dataset.step)
    this.assassinationMinutesRepeatTimer = setInterval(() => this.changeAssassinationMinutes({ currentTarget: { dataset: { step } } }), 100)
  },
  stopAssassinationMinutesRepeat() { clearInterval(this.assassinationMinutesRepeatTimer); this.assassinationMinutesRepeatTimer = null },
  validateAssassinationMinutes(event) {
    if (wx.hideKeyboard) wx.hideKeyboard()
    const value = String(event.detail.value || '').trim()
    if (!/^[0-9]+$/.test(value) || Number(value) < MIN_ASSASSINATION_MINUTES || Number(value) > MAX_ASSASSINATION_MINUTES) {
      this.setAssassinationMinutes(DEFAULT_ASSASSINATION_MINUTES)
      return wx.showToast({ title: '请输入 1 至 10 的整数，已恢复为 5 分钟', icon: 'none' })
    }
    this.setAssassinationMinutes(Number(value))
  },
  setQuestView(event) { this.setData({ questView: event.currentTarget.dataset.view }) },
  openRolePreview(event) {
    const roleDetail = this.data.rolePreview.find(item => item.id === event.currentTarget.dataset.id)
    if (roleDetail && !roleDetail.isSpacer) this.setData({ roleDetailOpen: true, roleDetail })
  },
  closeRolePreview() { this.setData({ roleDetailOpen: false }) },
  renamePlayer(event) {
    const id = Number(event.currentTarget.dataset.id)
    const name = event.detail.value.trim().slice(0, 10)
    if (!name) return
    this.updateLobby(this.data.players.map(player => player.id === id ? { ...player, name } : player))
  },
  openSeatPassword(event) {
    const id = Number(event.currentTarget.dataset.id)
    const player = this.data.players.find(item => item.id === id)
    if (player) this.setData({ seatPasswordOpen: true, passwordMode: 'setting', passwordSeatId: id, passwordSeatName: player.name, passwordSeatAvatarTone: player.avatarTone, passwordSeatAvatarUrl: player.avatarUrl, passwordDraft: player.name })
  },
  resetSeatPasswords() {
    this.updateLobby(this.data.players.map((player, index) => ({ ...player, password: String(index + 1) })))
    wx.showToast({ title: '已恢复默认密码', icon: 'success' })
  },
  toggleConfigOptions() { this.setData({ configOptionsOpen: !this.data.configOptionsOpen }) },
  toggleRoleCards() { this.setData({ roleCardsExpanded: !this.data.roleCardsExpanded }) },
  openIdentityPassword(event) {
    const id = Number(event.currentTarget.dataset.id)
    const player = this.data.players.find(item => item.id === id)
    if (!player) return
    if (this.data.identityUnlocked && this.data.selectedPlayerId !== id) {
      clearInterval(this.identityCollapseTimer)
      return this.setData({ selectedPlayerId: 0, selectedPlayer: null, identityUnlocked: false, roleVisible: false, identityCountdown: 0, visionPlayers: [] }, () => this.requestIdentityVerification(player))
    }
    this.requestIdentityVerification(player)
  },
  requestIdentityVerification(player) {
    if (player.password === String(player.id)) return this.setData({ identityConfirmOpen: true, identityConfirmMode: 'identity', identityConfirmPlayerId: player.id, identityConfirmName: player.name, identityConfirmAvatarUrl: player.avatarUrl, identityConfirmAvatarTone: player.avatarTone })
    this.setData({ seatPasswordOpen: true, passwordMode: 'unlock', passwordSeatId: player.id, passwordSeatName: player.name, passwordSeatAvatarTone: player.avatarTone, passwordSeatAvatarUrl: player.avatarUrl, passwordDraft: '' })
  },
  cancelIdentityConfirm() { this.setData({ identityConfirmOpen: false, identityConfirmMode: '', identityConfirmPlayerId: 0, identityConfirmName: '', identityConfirmAvatarUrl: '', identityConfirmAvatarTone: '' }) },
  confirmIdentitySeat() {
    const player = this.data.players.find(item => item.id === this.data.identityConfirmPlayerId)
    if (!player) return this.cancelIdentityConfirm()
    const hasViewedIdentity = this.data.identityViewedIds.indexOf(player.id) >= 0
    clearInterval(this.identityCollapseTimer)
    this.setData({ identityConfirmOpen: false, identityConfirmPlayerId: 0, identityConfirmName: '', identityConfirmAvatarUrl: '', identityConfirmAvatarTone: '', selectedPlayerId: player.id, selectedPlayer: player, selectedSkillStatus: this.getSkillStatus(player, this.data.roleStates), identityUnlocked: true, roleVisible: false, identityCollapsed: false, identityCountdown: 0, visionPlayers: this.getVisionPlayers(player, this.data.players) }, () => this.revealRole(hasViewedIdentity))
  },
  changePasswordDraft(event) {
    const value = String(event.detail.value || '')
    this.setData({ passwordDraft: this.data.passwordMode === 'setting' ? value.slice(0, 12) : value.replace(/\D/g, '').slice(0, 2) })
  },
  closeSeatPassword() { this.setData({ seatPasswordOpen: false, passwordDraft: '', passwordSeatAvatarTone: '', passwordSeatAvatarUrl: '' }) },
  confirmSeatPassword() {
    const password = this.data.passwordDraft
    const player = this.data.players.find(item => item.id === this.data.passwordSeatId)
    if (!player) return this.closeSeatPassword()
    if (this.data.passwordMode === 'setting') {
      const name = password.trim()
      if (!name) return wx.showToast({ title: '请输入骑士昵称', icon: 'none' })
      this.updateLobby(this.data.players.map(item => item.id === player.id ? { ...item, name } : item))
      return this.closeSeatPassword()
    }
    if (!/^\d{1,2}$/.test(password)) return wx.showToast({ title: '请输入 1 至 2 位数字', icon: 'none' })
    if (password !== player.password) return wx.showToast({ title: '密码不正确', icon: 'none' })
    const hasViewedIdentity = this.data.identityViewedIds.indexOf(player.id) >= 0
    clearInterval(this.identityCollapseTimer)
    this.setData({ seatPasswordOpen: false, passwordDraft: '', selectedPlayerId: player.id, selectedPlayer: player, selectedSkillStatus: this.getSkillStatus(player, this.data.roleStates), identityUnlocked: true, roleVisible: false, identityCollapsed: false, identityCountdown: 0, visionPlayers: this.getVisionPlayers(player, this.data.players) }, () => this.revealRole(hasViewedIdentity))
  },
  noop() {},
  createRoom() { this.setData({ roomCreated: true, teamMode: 'offline' }, () => this.dealGame()) },
  startCountdown() {
    if (!this.data.roomCreated) return wx.showToast({ title: '请先创建房间', icon: 'none' })
    if (this.data.joinedCount !== this.data.playerCount) return wx.showToast({ title: '请等待所有玩家入座', icon: 'none' })
    this.setData({ phase: 'countdown', countdown: 3 })
    this.countdownTimer = setInterval(() => {
      const countdown = this.data.countdown - 1
      if (countdown <= 0) { clearInterval(this.countdownTimer); return this.dealGame() }
      this.setData({ countdown })
    }, 1000)
  },
  dealGame() {
    const rule = getRule(this.data.playerCount, this.data.ninePlayerEvilCount)
    const shouldRefreshEvilTripleGuard = this.data.evilTripleGuardGameCount >= 3
    const nextEvilTripleGuardEnabled = shouldRefreshEvilTripleGuard ? Math.random() < .5 : this.data.evilTripleGuardEnabled
    const roles = dealRolesWithHistoryGuards(getRuleRoles(this.data.playerCount, this.data.ninePlayerEvilCount), this.data.players, this.data.roleHistory, this.data.specialRoleHistory, this.data.evilHistory, this.data.consecutiveRoleReroll, this.data.consecutiveSpecialRoleReroll, nextEvilTripleGuardEnabled)
    const players = this.data.players.map((player, index) => ({ ...player, identityViewed: false, role: roles[index], roleName: ROLE_LIBRARY[roles[index]].name, camp: ROLE_LIBRARY[roles[index]].camp, symbol: ROLE_LIBRARY[roles[index]].symbol, ability: ROLE_LIBRARY[roles[index]].ability, effect: ROLE_LIBRARY[roles[index]].effect }))
    const enriched = players.map(player => ({ ...player, vision: this.getPlayerVision(player) }))
    let storedFirstLeaderId = this.data.lastFirstLeaderId || 0
    let firstLeaderScores = {}
    try {
      storedFirstLeaderId = Number(wx.getStorageSync('avalon-last-first-leader-id')) || storedFirstLeaderId
      firstLeaderScores = wx.getStorageSync('avalon-first-leader-scores') || {}
    } catch (error) {}
    const leaderId = randomPriorityPlayerIdExcept(enriched, firstLeaderScores, storedFirstLeaderId)
    firstLeaderScores[leaderId] = (Number(firstLeaderScores[leaderId]) || 0) - 1
    try {
      wx.setStorageSync('avalon-last-first-leader-id', leaderId)
      wx.setStorageSync('avalon-first-leader-scores', firstLeaderScores)
    } catch (error) {}
    const speakingDirection = SPEAKING_DIRECTIONS[Math.floor(Math.random() * SPEAKING_DIRECTIONS.length)]
    const roleStates = this.createRoleStates(enriched)
    const roleHistory = enriched.reduce((history, player) => ({ ...history, [player.id]: player.role }), this.data.roleHistory)
    const specialRoleHistory = enriched.reduce((history, player) => ({ ...history, [player.id]: booleanTrailForSeat(history, player.id).concat(isSpecialRole(player.role)).slice(-2) }), this.data.specialRoleHistory)
    const evilHistory = enriched.reduce((history, player) => ({ ...history, [player.id]: booleanTrailForSeat(history, player.id).concat(player.camp === 'evil').slice(-2) }), this.data.evilHistory)
    const quests = rule.missions.map((mission, index) => {
      const failNeed = index === 3 ? (this.data.playerCount === 9 && this.data.ninePlayerEvilCount === 3 ? 1 : this.data.fourthQuestFailNeed) : mission.failCount
      return { index: mission.mission, teamSize: mission.playerCount, failNeed, status: 'pending', result: '', riders: [], leaderId: 0, hint: failNeed > 1 ? `需要 ${failNeed} 张失败牌` : '1 张失败牌即可失败' }
    })
    const offlineMode = this.data.teamMode === 'offline'
    this.setGame({ phase: 'game', subPhase: offlineMode ? (this.data.missionPhoneVoting ? 'phoneTeam' : 'offline') : 'team', players: enriched, roleStates, quests, roleHistory, specialRoleHistory, evilHistory, evilTripleGuardEnabled: nextEvilTripleGuardEnabled, evilTripleGuardGameCount: shouldRefreshEvilTripleGuard ? 1 : this.data.evilTripleGuardGameCount + 1, speakingDirection, leaderId, firstLeaderId: leaderId, lastFirstLeaderId: leaderId, proposalTeam: [], selectedPlayerId: 0, selectedPlayer: null, identityUnlocked: false, visionPlayers: [], roleVisible: false, identityCollapsed: false, identityViewedIds: [], roleCardsExpanded: true, currentQuest: 0, goodScore: 0, evilScore: 0, winner: '', resultText: '', rejectionCount: 0, missionQueue: [], missionStep: 0, missionFails: 0, missionVoteHistory: [], roleRevealOpen: false, missionResultOpen: false, lakeSkillOpen: false, lakeReturnSubPhase: '', lakeSkillResultOpen: false, notice: offlineMode ? (this.data.missionPhoneVoting ? '请车上成员依次传递手机投票。' : '线下完成组队与任务投票后，由房主记录本轮结果。') : '请由队长提名本轮远征队伍。' })
  },
  scheduleIdentityCollapse(seconds) {
    clearInterval(this.identityCollapseTimer)
    this.setData({ identityCountdown: seconds })
    this.identityCollapseTimer = setInterval(() => {
      const identityCountdown = this.data.identityCountdown - 1
      if (identityCountdown <= 0) return this.collapseIdentity()
      this.setData({ identityCountdown })
    }, 1000)
  },
  revealRole(hasViewedIdentity = false) {
    if (!this.data.identityUnlocked || !this.data.selectedPlayer) return
    const firstView = this.data.identityViewedIds.indexOf(this.data.selectedPlayerId) < 0
    const identityViewedIds = firstView ? this.data.identityViewedIds.concat(this.data.selectedPlayerId) : this.data.identityViewedIds
    this.setData({ roleVisible: true, identityViewedIds, players: this.data.players.map(player => ({ ...player, identityViewed: identityViewedIds.indexOf(player.id) >= 0 })) })
    this.scheduleIdentityCollapse(firstView && !hasViewedIdentity ? 15 : 5)
  },
  collapseIdentity() { clearInterval(this.identityCollapseTimer); this.setData({ selectedPlayerId: 0, selectedPlayer: null, selectedSkillStatus: null, identityUnlocked: false, visionPlayers: [], roleVisible: false, identityCollapsed: this.data.identityViewedIds.length >= this.data.players.length, identityCountdown: 0 }) },
  collapseIdentityForVote() { clearInterval(this.identityCollapseTimer); this.setData({ selectedPlayerId: 0, selectedPlayer: null, selectedSkillStatus: null, identityUnlocked: false, visionPlayers: [], roleVisible: false, identityCollapsed: true, identityCountdown: 0 }) },
  hideRole() { this.collapseIdentity() },
  toggleIdentitySelection() { if (this.data.identityUnlocked) return this.hideRole(); this.setData({ identityCollapsed: !this.data.identityCollapsed }) },
  openIdentityCard() {
    clearInterval(this.identityCollapseTimer)
    this.setData({ selectedPlayerId: 0, selectedPlayer: null, selectedSkillStatus: null, identityUnlocked: false, roleVisible: false, identityCollapsed: false, identityCountdown: 0, visionPlayers: [] })
  },
  toggleTeam(event) {
    if (this.data.teamMode !== 'mobile' || this.data.subPhase !== 'team') return
    const id = Number(event.currentTarget.dataset.id)
    const quest = this.data.quests[this.data.currentQuest]
    const team = this.data.proposalTeam.slice()
    const at = team.indexOf(id)
    if (at >= 0) team.splice(at, 1)
    else if (team.length < quest.teamSize) team.push(id)
    else return wx.showToast({ title: `本轮只能选择 ${quest.teamSize} 人`, icon: 'none' })
    this.setGame({ proposalTeam: team })
  },
  submitTeam() {
    if (this.data.teamMode !== 'mobile') return
    const quest = this.data.quests[this.data.currentQuest]
    if (this.data.proposalTeam.length !== quest.teamSize) return wx.showToast({ title: `请提名 ${quest.teamSize} 位玩家`, icon: 'none' })
    this.setGame({ subPhase: 'decision', notice: '远征队已确定，请由房主标记流车或开始任务投票。' })
  },
  markHostDecision(event) {
    const result = event.currentTarget.dataset.result
    if (result === 'mission') return this.beginMission()
    if (result !== 'flow') return
    const rejectionCount = this.data.rejectionCount + 1
    if (rejectionCount === 5) return this.finishGame('邪恶阵营胜利', '连续五次组队提案被否决，邪恶阵营立刻获胜。')
    const leaderId = nextPlayerId(this.data.leaderId, this.data.playerCount)
    this.setGame({ subPhase: 'team', proposalTeam: [], rejectionCount, leaderId, notice: `房主标记本车流车。第 ${rejectionCount} 次流车，队长轮转。` })
  },
  beginMission() {
    if (this.data.teamMode !== 'mobile') return
    const missionQueue = this.data.proposalTeam.slice()
    const firstPlayer = this.data.players.find(player => player.id === missionQueue[0])
    this.setGame({ subPhase: 'mission', missionQueue, missionStep: 0, missionCurrentNumber: 1, missionFails: 0, missionCards: [], notice: `请将设备交给 ${firstPlayer ? firstPlayer.name : '首位队员'} 投放任务票。` })
  },
  submitMissionCard(event) {
    const card = event.currentTarget.dataset.card
    const phoneMission = this.data.subPhase === 'phoneMission'
    const playerId = phoneMission ? this.data.phoneVoterId : this.data.missionQueue[this.data.missionStep]
    const player = this.data.players.find(item => item.id === playerId)
    if (!player || (player.camp === 'good' && card !== 'success')) return
    this.collapseIdentityForVote()
    const missionFails = this.data.missionFails + (card === 'fail' ? 1 : 0)
    const missionCards = this.data.missionCards.concat(card)
    const missionVoteHistory = phoneMission ? this.data.missionVoteHistory.concat({ playerId, round: this.data.roundNumber, card }) : this.data.missionVoteHistory
    const missionStep = this.data.missionStep + 1
    if (missionStep >= this.data.missionQueue.length) {
      if (phoneMission) return this.setGame({ subPhase: 'phoneReveal', missionFails, missionCards, missionVoteHistory, phoneVoterId: 0, phoneVotedIds: this.data.phoneVotedIds.concat(playerId), notice: '所有任务票已投放，请由房主点击开票。' }, () => this.scrollPhoneRevealIntoView())
      return this.finishMission(missionFails, missionCards)
    }
    if (phoneMission) return this.setGame({ missionStep, missionCurrentNumber: missionStep + 1, missionFails, missionCards, missionVoteHistory, phoneVoterId: 0, phoneVotedIds: this.data.phoneVotedIds.concat(playerId), notice: '请将设备交给下一位本车骑士，并由其选择自己的座位投票。' }, () => this.scrollPhoneMissionIntoView())
    const nextPlayer = this.data.players.find(item => item.id === this.data.missionQueue[missionStep])
    this.setGame({ missionStep, missionCurrentNumber: missionStep + 1, missionFails, missionCards, notice: `请将设备交给 ${nextPlayer ? nextPlayer.name : '下一位队员'} 投放任务票。` })
  },
  selectPhoneMissionVoter(event) {
    if ((this.data.subPhase !== 'phoneMission' && this.data.subPhase !== 'phoneReveal') || this.data.phoneVoterId) return
    const id = Number(event.currentTarget.dataset.id)
    if (!id) return
    if (this.data.phoneVotedIds.indexOf(id) >= 0) return
    const player = this.data.players.find(item => item.id === id)
    if (!player) return
    this.setGame({ phoneVoterId: player.id, notice: `请由 ${player.name} 私下选择并投放任务牌。` })
  },
  requestPhoneVoteReset(event) {
    const id = Number(event.currentTarget.dataset.id)
    if ((this.data.subPhase !== 'phoneMission' && this.data.subPhase !== 'phoneReveal') || this.data.phoneVotedIds.indexOf(id) < 0) return
    this.setData({ phoneVoteResetConfirmOpen: true, phoneVoteResetTargetId: id })
  },
  cancelPhoneVoteReset() { this.setData({ phoneVoteResetConfirmOpen: false, phoneVoteResetTargetId: 0 }) },
  confirmPhoneVoteReset() {
    const id = this.data.phoneVoteResetTargetId
    this.setData({ phoneVoteResetConfirmOpen: false, phoneVoteResetTargetId: 0 })
    const index = this.data.phoneVotedIds.indexOf(id)
    if (index < 0) return
    const phoneVotedIds = this.data.phoneVotedIds.filter(playerId => playerId !== id)
    const missionCards = this.data.missionCards.filter((_, cardIndex) => cardIndex !== index)
    const missionFails = missionCards.filter(card => card === 'fail').length
    const missionVoteHistory = this.data.missionVoteHistory.filter(vote => vote.playerId !== id || vote.round !== this.data.roundNumber)
    this.setGame({ subPhase: 'phoneMission', phoneVoterId: 0, phoneVotedIds, missionCards, missionFails, missionVoteHistory, missionStep: missionCards.length, missionCurrentNumber: missionCards.length + 1, notice: '已撤回该座位的任务票，请重新选择投票人。' })
  },
  resetPhoneMissionVoter() {
    if (this.data.subPhase !== 'phoneMission') return
    this.setGame({ phoneVoterId: 0, notice: '请重新选择本车当前投票骑士。' })
  },
  cancelPhoneMissionVoting() {
    if (this.data.subPhase !== 'phoneMission') return
    const missionVoteHistory = this.data.missionVoteHistory.filter(vote => vote.round !== this.data.roundNumber)
    this.setGame({ subPhase: 'phoneTeam', missionQueue: [], missionStep: 0, missionCurrentNumber: 1, missionFails: 0, missionCards: [], missionVoteHistory, phoneVoterId: 0, phoneVotedIds: [], phoneMissionTeam: [], notice: '已取消本车手机投票。' })
  },
  openPhoneTeamPicker(event) {
    const questIndex = Number(event.currentTarget.dataset.index)
    const quest = this.data.quests.find(item => item.index === questIndex)
    if (!quest || (quest.status !== 'success' && quest.status !== 'fail')) return
    const votedRiders = this.data.missionVoteHistory.filter(vote => vote.round === questIndex).map(vote => vote.playerId)
    this.collapseIdentityForVote()
    const team = (quest.riders || []).length ? quest.riders.slice() : votedRiders
    this.setGame({ phoneMissionTeam: team, phoneTeamPickerQuestIndex: questIndex, phoneTeamPickerLeaderId: team.indexOf(quest.leaderId) >= 0 ? quest.leaderId : (team[0] || 0), phoneTeamPickerOpen: true, notice: `请选择第 ${questIndex} 车的 ${quest.teamSize} 位骑士；长按席位可标记车长。` })
  },
  togglePhoneTeamPlayer(event) {
    if (!this.data.phoneTeamPickerOpen) return
    const id = Number(event.currentTarget.dataset.id)
    const quest = this.data.quests.find(item => item.index === this.data.phoneTeamPickerQuestIndex)
    if (!quest) return
    const team = this.data.phoneMissionTeam.slice()
    const index = team.indexOf(id)
    if (index >= 0) team.splice(index, 1)
    else if (team.length < quest.teamSize) team.push(id)
    else return wx.showToast({ title: `本车只能选择 ${quest.teamSize} 人`, icon: 'none' })
    this.setGame({ phoneMissionTeam: team, phoneTeamPickerLeaderId: team.indexOf(this.data.phoneTeamPickerLeaderId) >= 0 ? this.data.phoneTeamPickerLeaderId : (team[0] || 0) })
  },
  selectPhoneTeamLeader(event) {
    const id = Number(event.currentTarget.dataset.id)
    const quest = this.data.quests.find(item => item.index === this.data.phoneTeamPickerQuestIndex)
    if (!quest) return
    const team = this.data.phoneMissionTeam.slice()
    if (team.indexOf(id) < 0) {
      if (team.length >= quest.teamSize) return wx.showToast({ title: `本车只能选择 ${quest.teamSize} 人`, icon: 'none' })
      team.push(id)
    }
    this.setGame({ phoneMissionTeam: team, phoneTeamPickerLeaderId: id })
  },
  closePhoneTeamPicker() { this.setData({ phoneMissionTeam: [], phoneTeamPickerOpen: false, phoneTeamPickerQuestIndex: 0, phoneTeamPickerLeaderId: 0 }) },
  confirmPhoneTeamPicker() {
    const quest = this.data.quests.find(item => item.index === this.data.phoneTeamPickerQuestIndex)
    if (!quest) return
    if (this.data.phoneMissionTeam.length !== quest.teamSize) return wx.showToast({ title: `请选择 ${quest.teamSize} 位骑士`, icon: 'none' })
    const leaderId = this.data.phoneMissionTeam.indexOf(this.data.phoneTeamPickerLeaderId) >= 0 ? this.data.phoneTeamPickerLeaderId : (this.data.phoneMissionTeam[0] || 0)
    const quests = this.data.quests.map(item => item.index === quest.index ? { ...item, riders: this.data.phoneMissionTeam.slice(), leaderId } : item)
    this.setGame({ quests, phoneMissionTeam: [], phoneTeamPickerQuestIndex: 0, phoneTeamPickerLeaderId: 0, phoneTeamPickerOpen: false, notice: `第 ${quest.index} 车成员与车长已更新。` })
  },
  finishMission(fails, cards) {
    const quest = this.data.quests[this.data.currentQuest]
    const result = fails >= quest.failNeed ? 'fail' : 'success'
    this.resolveMissionResult(result, cards)
  },
  markOfflineMission(event) {
    if (this.data.teamMode !== 'offline') return
    const result = event.currentTarget.dataset.result
    if (result !== 'success' && result !== 'fail') return
    if (this.data.missionPhoneVoting) return this.setData({ manualMissionConfirmOpen: true, manualMissionResult: result })
    this.collapseIdentityForVote()
    this.resolveMissionResult(result, [])
  },
  cancelManualMissionResult() { this.setData({ manualMissionConfirmOpen: false, manualMissionResult: '' }) },
  confirmManualMissionResult() {
    const result = this.data.manualMissionResult
    if (result !== 'success' && result !== 'fail') return this.cancelManualMissionResult()
    this.setData({ manualMissionConfirmOpen: false, manualMissionResult: '' }, () => { this.collapseIdentityForVote(); this.resolveMissionResult(result, []) })
  },
  scrollPhoneMissionIntoView() {
    wx.nextTick(() => {
      const query = wx.createSelectorQuery()
      query.select('.phone-mission-seat-grid').boundingClientRect()
      query.selectViewport().scrollOffset()
      query.exec(result => {
        const seats = result[0]
        const viewport = result[1]
        if (!seats || !viewport) return
        wx.pageScrollTo({ scrollTop: Math.max(0, viewport.scrollTop + seats.top - 86), duration: 280 })
      })
    })
  },
  scrollPhoneRevealIntoView() {
    wx.nextTick(() => {
      const query = wx.createSelectorQuery()
      query.select('.phone-reveal-button').boundingClientRect()
      query.selectViewport().scrollOffset()
      query.exec(result => {
        const revealButton = result[0]
        const viewport = result[1]
        if (!revealButton || !viewport) return
        const windowHeight = wx.getWindowInfo().windowHeight
        wx.pageScrollTo({ scrollTop: Math.max(0, viewport.scrollTop + revealButton.bottom - windowHeight + 28), duration: 280 })
      })
    })
  },
  scrollAssassinationTargetsIntoView() {
    wx.nextTick(() => {
      const query = wx.createSelectorQuery()
      query.select('.assassination-target-preview-list').boundingClientRect()
      query.selectViewport().scrollOffset()
      query.exec(result => {
        const targets = result[0]
        const viewport = result[1]
        if (!targets || !viewport) return
        const windowHeight = wx.getWindowInfo().windowHeight
        const offset = targets.height <= windowHeight - 72
          ? targets.top - 36
          : targets.bottom - windowHeight + 24
        wx.pageScrollTo({ scrollTop: Math.max(0, viewport.scrollTop + offset), duration: 280 })
      })
    })
  },
  startPhoneMission() {
    const quest = this.data.quests[this.data.currentQuest]
    this.collapseIdentityForVote()
    this.setGame({ subPhase: 'phoneMission', missionQueue: Array.from({ length: quest.teamSize }, () => 0), missionStep: 0, missionCurrentNumber: 1, missionFails: 0, missionCards: [], phoneVoterId: 0, phoneVotedIds: [], phoneMissionTeam: [], notice: `请将设备依次传给本车 ${quest.teamSize} 位骑士，由每人选择自己的座位投票。` }, () => this.scrollPhoneMissionIntoView())
  },
  revealPhoneMission() {
    const fails = this.data.missionFails
    const cards = this.data.missionCards
    const quest = this.data.quests[this.data.currentQuest]
    const result = fails >= quest.failNeed ? 'fail' : 'success'
    const bombCount = result === 'fail' ? Math.max(1, cards.filter(card => card === 'fail').length) : 0
    const seconds = result === 'success' ? 2 : 5
    clearTimeout(this.missionResultTimer)
    clearInterval(this.missionResultCountdownTimer)
    this.setData({ missionResultOpen: true, missionResultTitle: result === 'success' ? '任务成功' : '任务失败', missionResultCopy: result === 'fail' ? `本轮统计到 ${bombCount} 枚炸弹` : '本轮任务结果已记录', missionResultBombCount: bombCount, missionResultSeconds: seconds })
    this.resolveMissionResult(result, cards)
    this.missionResultCountdownTimer = setInterval(() => {
      const next = this.data.missionResultSeconds - 1
      if (next > 0) this.setData({ missionResultSeconds: next })
    }, 1000)
    this.missionResultTimer = setTimeout(() => {
      clearInterval(this.missionResultCountdownTimer)
      this.setData({ missionResultOpen: false, missionResultSeconds: 0 })
    }, seconds * 1000)
  },
  closeMissionResult() { clearTimeout(this.missionResultTimer); clearInterval(this.missionResultCountdownTimer); this.setData({ missionResultOpen: false, missionResultSeconds: 0 }) },
  chooseBombCount(quest) {
    const counts = Array.from({ length: quest.teamSize }, (_, index) => index + 1)
    wx.showActionSheet({ itemList: counts.map(count => `${'💣'.repeat(count)}  ${count} 张失败票`), success: ({ tapIndex }) => this.updateQuestBombCount(quest.index, counts[tapIndex]) })
  },
  updateQuestBombCount(questIndex, bombCount) {
    const quests = this.data.quests.map(quest => quest.index === questIndex ? { ...quest, bombCount, result: '💣'.repeat(bombCount) } : quest)
    this.setGame({ quests })
  },
  openBombCountPicker(event) {
    const questIndex = Number(event.currentTarget.dataset.index)
    const quest = this.data.quests.find(item => item.index === questIndex)
    if (quest && quest.status === 'fail') this.chooseBombCount(quest)
  },
  resolveMissionResult(result, cards) {
    const quest = this.data.quests[this.data.currentQuest]
    const bombCount = result === 'fail' ? Math.max(1, cards.filter(card => card === 'fail').length) : 0
    const quests = this.data.quests.map(item => item.index === quest.index ? { ...item, status: result, bombCount, result: result === 'success' ? '成功' : '💣'.repeat(bombCount) } : item)
    const goodScore = this.data.goodScore + (result === 'success' ? 1 : 0)
    const evilScore = this.data.evilScore + (result === 'fail' ? 1 : 0)
    const skillChanges = this.applySkillEvent(result === 'success' ? 'MISSION_SUCCESS' : 'MISSION_FAILED', this.data, { missionNumber: quest.index })
    const missionEndChanges = this.applySkillEvent('MISSION_END', { ...this.data, ...skillChanges }, { missionNumber: quest.index })
    const skillState = { players: missionEndChanges.players, roleStates: missionEndChanges.roleStates }
    const lakeSkillOpen = Object.values(skillState.roleStates).some(entry => entry.skillType === 'CHECK_CAMP' && entry.state.pending)
    if (evilScore === 3) return this.finishGame('邪恶阵营胜利', '房主已标记三次任务失败，邪恶阵营获胜。', { ...skillState, quests, goodScore, evilScore })
    if (goodScore >= 3) {
      const assassin = skillState.players.find(player => player.role === 'assassin')
      if (assassin) return this.startAssassinationCountdown({ ...skillState, quests, goodScore, evilScore, currentQuest: this.data.currentQuest + 1, missionCards: cards })
      return this.finishGame('好人阵营胜利', '好人已完成三次任务，且本局没有刺客。', { ...skillState, quests, goodScore, evilScore })
    }
    const offlineMode = this.data.teamMode === 'offline'
    const nextSubPhase = offlineMode ? (this.data.missionPhoneVoting ? 'phoneTeam' : 'offline') : 'team'
    this.setGame({ ...skillState, quests, goodScore, evilScore, currentQuest: this.data.currentQuest + 1, leaderId: nextPlayerId(this.data.leaderId, this.data.playerCount), proposalTeam: [], phoneMissionTeam: [], subPhase: lakeSkillOpen ? 'lakeSkill' : nextSubPhase, lakeReturnSubPhase: lakeSkillOpen ? nextSubPhase : '', missionCards: cards, lakeSkillOpen, notice: lakeSkillOpen ? '湖中审判开始。' : (offlineMode ? (this.data.missionPhoneVoting ? '请为下一辆车选择骑士并开始手机投票。' : `房主已标记本轮任务${result === 'success' ? '成功' : '失败'}，请线下进行下一轮。`) : `房主标记本轮任务${result === 'success' ? '成功' : '失败'}。队长轮转，请开始下一轮。`) })
  },
  useLakeSkill(event) {
    const targetId = Number(event.currentTarget.dataset.id)
    const roleStates = JSON.parse(JSON.stringify(this.data.roleStates || {}))
    const lakeSkill = Object.values(roleStates).find(entry => entry.skillType === 'CHECK_CAMP' && entry.state.pending)
    const target = this.data.players.find(player => player.id === targetId)
    if (!lakeSkill || !target || target.id === lakeSkill.holderId || lakeSkill.state.checkedPlayers.indexOf(target.id) >= 0) return
    lakeSkill.state.checkedPlayers.push(target.id)
    lakeSkill.state.remainingCount -= 1
    lakeSkill.state.pending = false
    lakeSkill.state.nextTriggerMission = lakeSkill.state.triggerMission + 1
    lakeSkill.holderId = lakeSkill.state.remainingCount > 0 ? target.id : null
    this.setGame({ roleStates, subPhase: this.data.lakeReturnSubPhase || this.data.subPhase, lakeReturnSubPhase: '', lakeSkillOpen: false, lakeSkillResultOpen: true, lakeSkillResultTargetName: target.name, lakeSkillResultCamp: target.camp === 'good' ? 'GOOD' : 'EVIL', lakeSkillResultCopy: lakeSkill.state.remainingCount > 0 ? '仅展示阵营；查验权已转交给该玩家。' : '仅展示阵营；湖中审判已结束。', notice: '湖中审判已经完成。' })
  },
  closeLakeSkillResult() { this.setData({ lakeSkillResultOpen: false, lakeSkillResultTargetName: '', lakeSkillResultCamp: '', lakeSkillResultCopy: '' }) },
  startAssassinationCountdown(changes) {
    clearInterval(this.assassinationTimer)
    this.setData({ roleCardsExpanded: true })
    const assassinationSeconds = this.data.assassinationMinutes * 60
    const host = (changes.players || this.data.players)[0]
    this.setGame({ ...changes, subPhase: 'assassinationCountdown', selectedPlayerId: 1, selectedPlayer: host, identityUnlocked: false, roleVisible: false, identityCollapsed: true, visionPlayers: [], assassinationCountdown: assassinationSeconds, assassinationTimeText: formatAssassinationTime(assassinationSeconds), notice: '好人已完成三次任务，邪恶阵营有 ' + this.data.assassinationMinutes + ' 分钟讨论刺杀目标。' }, () => this.scrollAssassinationTargetsIntoView())
    this.assassinationTimer = setInterval(() => {
      const assassinationCountdown = this.data.assassinationCountdown - 1
      if (assassinationCountdown <= 0) {
        clearInterval(this.assassinationTimer)
        return this.finishGame('好人阵营胜利', '刺杀讨论时间结束，刺客未选择刺杀目标，邪恶阵营失败。')
      }
      this.setData({ assassinationCountdown, assassinationTimeText: formatAssassinationTime(assassinationCountdown) })
    }, 1000)
  },
  selectAssassinationTarget(event) {
    const canAssassinate = this.data.teamMode === 'offline' || this.data.selectedPlayerId === 1 || (this.data.selectedPlayer && this.data.selectedPlayer.role === 'assassin')
    if (!canAssassinate || (this.data.subPhase !== 'assassinationCountdown' && this.data.subPhase !== 'assassinate')) return
    const id = Number(event.currentTarget.dataset.id)
    const target = this.data.players.find(player => player.id === id && player.camp === 'good')
    if (target) this.setData({ assassinationConfirmOpen: true, assassinationTarget: target })
  },
  cancelAssassination() { this.setData({ assassinationConfirmOpen: false, assassinationTarget: null }) },
  confirmAssassination() {
    const target = this.data.assassinationTarget
    if (!target) return
    this.setData({ assassinationConfirmOpen: false })
    if (target.role === 'merlin') this.finishGame('邪恶阵营胜利', `刺杀成功：${target.name} 正是梅林。`)
    else this.finishGame('好人阵营胜利', `刺杀失败：${target.name} 并非梅林。`)
  },
  requestEndGame() { this.setData({ endGameConfirmOpen: true }) },
  cancelEndGame() { this.setData({ endGameConfirmOpen: false }) },
  confirmEndGame() { this.setData({ endGameConfirmOpen: false }, () => this.restart()) },
  finishGame(winner, resultText, extra = {}) { clearInterval(this.assassinationTimer); this.setGame({ ...extra, winner, resultText, subPhase: 'ended', roleRevealOpen: true, assassinationConfirmOpen: false, notice: '' }) },
  closeRoleReveal() { this.restart() },
  restart() {
    clearInterval(this.countdownTimer); clearInterval(this.assassinationTimer); clearInterval(this.identityCollapseTimer); clearTimeout(this.missionResultTimer)
    const players = makePlayers(this.data.playerCount, this.data.players)
    const assassinationSeconds = this.data.assassinationMinutes * 60
    const ninePlayerEvilCount = this.data.playerCount === 9 && this.data.ninePlayerEvilMode === 'random' ? (Math.random() < .5 ? 3 : 4) : this.data.ninePlayerEvilCount
    const rolePreview = makeRolePreview(this.data.playerCount, ninePlayerEvilCount)
    const fourthQuestFailNeed = this.data.playerCount === 9 && ninePlayerEvilCount === 3 ? 1 : fourthMissionFailNeedForPlayerCount(this.data.playerCount)
    try { wx.removeStorageSync(ACTIVE_GAME_STORAGE_KEY) } catch (error) {}
    //wick 20260808@ Default every newly created offline game to phone voting {
    this.setData({ phase: 'lobby', subPhase: 'team', roomCreated: false, missionPhoneVoting: true, ninePlayerEvilCount, fourthQuestFailNeed, rolePreview, goodRoleRows: makeRoleRows(rolePreview.filter(card => card.camp === 'good')), evilRoleRows: makeRoleRows(rolePreview.filter(card => card.camp === 'evil')), players, joinedCount: players.filter(player => player.joined).length, selectedPlayerId: 0, selectedPlayer: null, selectedSkillStatus: null, roleStates: {}, lakeSkillOpen: false, lakeReturnSubPhase: '', lakeSkillResultOpen: false, lakeSkillResultTargetName: '', lakeSkillResultCamp: '', lakeSkillResultCopy: '', identityUnlocked: false, visionPlayers: [], quests: [], currentQuest: 0, goodScore: 0, evilScore: 0, winner: '', resultText: '', roleVisible: false, identityCollapsed: false, identityCountdown: 0, identityViewedIds: [], proposalTeam: [], rejectionCount: 0, missionQueue: [], missionStep: 0, missionFails: 0, missionVoteHistory: [], phoneMissionTeam: [], phoneTeamPickerOpen: false, phoneTeamPickerQuestIndex: 0, phoneTeamPickerLeaderId: 0, assassinationCountdown: assassinationSeconds, assassinationTimeText: formatAssassinationTime(assassinationSeconds), roleRevealOpen: false, assassinationConfirmOpen: false, assassinationTarget: null, missionResultOpen: false, missionResultTitle: '', notice: '' })
    //wick 20260808@ Default every newly created offline game to phone voting }
  }
})
