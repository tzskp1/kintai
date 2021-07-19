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
    const res = await fetch("/api/login", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: email, pass })
    });
    if (res.ok) {
        return (await res.json()).token as string;
    } else {
        return undefined;
    }
};

export const getToken = () => {
    let t = localStorage.getItem('token');
    if (t && (new Date()).getTime() < (new Date(decodeJwt(t).exp * 1000)).getTime()) {
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
            'Authorization': "bearer " + token,
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

export type User = {
    isadmin: boolean;
    id: string;
}

export type Shift = {
    start_time: Date;
    end_time: Date;
    permitted: boolean;
    absent: boolean;
    username: string;
    enable: boolean;
    created_by: string;
    id: number;
}

export const getUsers = async () => {
    let token = getToken();
    if (!token) return undefined;
    let res = await fetch('/api/users', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': "bearer " + token,
        },
    });
    if (res.ok) {
        return await res.json() as User[];
    } else {
        return undefined;
    }
};

export const getSchedules = async (start: Date, end: Date) => {
    let token = getToken();
    if (!token) return undefined;
    const st = start.toISOString().split("T")[0];
    const ed = end.toISOString().split("T")[0];
    let res = await fetch(`/api/schedules?start=${st}&end=${ed}`, {
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
    let res = await fetch(`/api/schedules/${id}/duration`, {
        method: 'PATCH',
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

export const timeFormat = (d: Date) => {
    return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
}

export const iter = <T>(f: (_: T) => T, n: number): (_: T) => T => (x: T) => {
    let i;
    for (i = 0; i < n; i++) {
        x = f(x);
    }
    return x;
};

export const id = <T>(x: T): T => x;

export const deleteSchedule = async (id: number) => {
    let token = getToken();
    if (!token) return undefined;
    let res = await fetch(`/api/schedules/${id}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': "bearer " + token,
        }
    });
    if (res.ok) {
        return await res.json();
    } else {
        return undefined;
    }
};

const touchSchedule = async (verb: string) => {
    let token = getToken();
    if (!token) return undefined;
    let res = await fetch(verb, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': "bearer " + token,
        }
    });
    if (res.ok) {
        return await res.json();
    } else {
        return undefined;
    }
};

export const disableSchedule = async (id: number) =>
    await touchSchedule(`/api/schedules/${id}/availability`);

export const permitSchedule = async (id: number) =>
    await touchSchedule(`/api/schedules/${id}/permission`);

export const absentSchedule = async (id: number) =>
    await touchSchedule(`/api/schedules/${id}/absence`);

export const postUser = async (username: string, isadmin: boolean) => {
    let token = getToken();
    if (!token) return undefined;
    let res = await fetch("/api/users", {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': "bearer " + token,
        },
        body: JSON.stringify({ id: username, isadmin })
    });
    if (res.ok) {
        return await res.json();
    } else {
        return undefined;
    }
};
