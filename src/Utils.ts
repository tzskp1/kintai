
export const decodeJwt = (token: string) => {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(window.atob(base64))));
};

export const login = async (email: string, pass: string) => {
    let t = await (await fetch("/api/login", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: email, pass })
    })).json();
    return t.token;
};

export const getToken = () => {
    let t = localStorage.getItem('token');
    if (t && new Date() < new Date(decodeJwt(t).exp * 1000)) {
        return t;
    } else {
        return undefined;
    }
};

export const postSchedule = async (username: string, startTime: Date, endTime: Date) => {
    let token = getToken();
    if (!token) return undefined;
    let res = await fetch("/api/schedules", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token,
        },
        body: JSON.stringify({
            username,
            start_time: startTime.toISOString().replace('Z', ''),
            end_time: endTime.toISOString().replace('Z', '')
        })
    });
    if (res.ok) {
        let ret = await res.json();
        return ret.id as number;
    } else {
        return undefined;
    }
};
