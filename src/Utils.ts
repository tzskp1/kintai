export const seq = (i: number) => {
    const dst: number[] = [];
    let j = 0;
    for (j = 0; j < i; j++) {
        dst.push(j);
    }
    return dst;
};

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

export const postSchedule = async (startTime: Date, endTime: Date) => {
    let token = getToken();
    if (!token) return undefined;
    let res = await fetch("/api/schedules", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': "bearer " + token,
        },
        body: JSON.stringify({
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

export type Shift = {
    start_time: Date;
    end_time: Date;
    permitted: boolean;
    username: string;
    id: number
}

export const getSchedules = async () => {
    let token = getToken();
    if (!token) return undefined;
    let res = await fetch("/api/schedules", {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': "bearer " + token,
        },
    });
    if (res.ok) {
        let ret = await res.json();
        return ret.map((x: any) => {
            return {
                ...x,
                start_time: new Date(x.start_time + 'Z'),
                end_time: new Date(x.end_time + 'Z')
            }
        }) as Shift[];
    } else {
        return undefined;
    }
};

export const day = 24 * 60 * 60 * 1000;

export const updateSchedule = async (id: number, startTime: Date, endTime: Date) => {
    let token = getToken();
    if (!token) return undefined;
    let res = await fetch(`/api/schedules/${id}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': "bearer " + token,
        },
        body: JSON.stringify({
            start_time: startTime.toISOString().replace('Z', ''),
            end_time: endTime.toISOString().replace('Z', '')
        })
    });
    if (res.ok) {
        return await res.json();
    } else {
        return undefined;
    }
};

export const addDay = (d: Date, days: number) => {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

export const toDate = (d: Date) => {
    let t = new Date(d);
    t.setHours(0);
    t.setMinutes(0);
    t.setSeconds(0);
    t.setMilliseconds(0);
    return t;
}
