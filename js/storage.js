
const DB = {
  usersKey: 'z_users',
  sessionKey: 'z_session',
  timesKey: 'z_times',
  planKey: 'z_plan'
};
function readUsers(){ return JSON.parse(localStorage.getItem(DB.usersKey) || '[]'); }
function writeUsers(arr){ localStorage.setItem(DB.usersKey, JSON.stringify(arr)); }
function readSession(){ return JSON.parse(localStorage.getItem(DB.sessionKey) || 'null'); }
function writeSession(s){ localStorage.setItem(DB.sessionKey, JSON.stringify(s)); }
function readTimes(){ return JSON.parse(localStorage.getItem(DB.timesKey) || '{}'); }
function writeTimes(obj){ localStorage.setItem(DB.timesKey, JSON.stringify(obj)); }
function readPlan(){ return JSON.parse(localStorage.getItem(DB.planKey) || '{}'); }
function writePlan(obj){ localStorage.setItem(DB.planKey, JSON.stringify(obj)); }
