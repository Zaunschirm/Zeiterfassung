
const DB = { usersKey:'z_users', sessionKey:'z_session', timesKey:'z_times', planKey:'z_plan' };
const readUsers = ()=> JSON.parse(localStorage.getItem(DB.usersKey)||'[]');
const writeUsers = (a)=> localStorage.setItem(DB.usersKey, JSON.stringify(a));
const readSession = ()=> JSON.parse(localStorage.getItem(DB.sessionKey)||'null');
const writeSession = (s)=> localStorage.setItem(DB.sessionKey, JSON.stringify(s));
const readTimes = ()=> JSON.parse(localStorage.getItem(DB.timesKey)||'{}');
const writeTimes = (o)=> localStorage.setItem(DB.timesKey, JSON.stringify(o));
const readPlan = ()=> JSON.parse(localStorage.getItem(DB.planKey)||'{}');
const writePlan = (o)=> localStorage.setItem(DB.planKey, JSON.stringify(o));
