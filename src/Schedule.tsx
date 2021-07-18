import React, { useState, useRef, useEffect, useCallback } from 'react';
import Paper from '@material-ui/core/Paper';
import CssBaseline from '@material-ui/core/CssBaseline';
import Divider from '@material-ui/core/Divider';
import Hidden from '@material-ui/core/Hidden';
import IconButton from '@material-ui/core/IconButton';
import DeleteIcon from '@material-ui/icons/Delete';
import InboxIcon from '@material-ui/icons/MoveToInbox';
import CloseIcon from '@material-ui/icons/Close';
import HealingIcon from '@material-ui/icons/Healing';
import AssignmentIcon from '@material-ui/icons/Assignment';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import MailIcon from '@material-ui/icons/Mail';
import MenuIcon from '@material-ui/icons/Menu';
import BlockIcon from '@material-ui/icons/Block';
import Typography from '@material-ui/core/Typography';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import NavigateBeforeIcon from '@material-ui/icons/NavigateBefore';
import NavigateNextIcon from '@material-ui/icons/NavigateNext';
import Toolbar from '@material-ui/core/Toolbar';
import { makeStyles, useTheme, Theme, createStyles } from '@material-ui/core/styles';
import Box from '@material-ui/core/Box';
import { sizing, palette, positions } from '@material-ui/system';
import * as Utils from './Utils';
import { getSchedules, seq, Shift, day, updateSchedule, deleteSchedule, getToken, addDay, toDate, timeFormat, postSchedule, decodeJwt, iter, getUsers, User } from './Utils';
import { useResizeDetector } from 'react-resize-detector';
import { useHistory } from 'react-router-dom';
import Popover from '@material-ui/core/Popover';
import Grid from '@material-ui/core/Grid';
import DateFnsUtils from '@date-io/date-fns';
import { KeyboardDateTimePicker, MuiPickersUtilsProvider } from '@material-ui/pickers';

const useStyles = makeStyles((theme: Theme) =>
    createStyles({
        tableHead: {
            userSelect: 'none',
            borderLeft: '1px solid'
        },
        tableCell: {
            borderLeft: '1px solid',
            padding: "0px 16px"
        },
        tableTime: {
            userSelect: 'none',
            padding: "0px 16px"
        },
        tableRow: {
            height: '25px'
        },
    }),
);

const date2index = (d: Date) => {
    let t = d.getTime() - toDate(d).getTime();
    return t / (30 * 60 * 1000);
}

const index2unixtime = (i: number) => {
    return i * (30 * 60 * 1000);
}

const findVacant = (xs: [number, number][]) => {
    let cur = 0, i;
    if (xs.length === 0) return 0;
    for (i = 0; i < xs.length; i++) {
        if (cur < xs[i][1]) {
            return cur;
        } else {
            cur = xs[i][1] + 1;
        }
    }
    return xs[xs.length - 1][1] + 1;
}

const fixBox = (b: [number, number, number, number]): [number, number, number, number] => {
    const r = 0.8;
    const [x, y, w, h] = b;
    return [x + w * (1 - r), y, w * r, h];
}

const insertLane = (s: Shift, ls: [number, number][][][], startDate: Date) => {
    const st = Math.max(Math.floor(date2index(s.start_time)), 0);
    const end = Math.min(Math.floor(date2index(s.end_time)), 47);
    const sx = Math.min(Math.max(Math.floor((s.start_time.getTime() - startDate.getTime()) / day), 0), 6);
    const ex = Math.min(Math.max(Math.floor((s.end_time.getTime() - startDate.getTime()) / day), 0), 6);

    let i, j;
    let xs = ls[st][sx];
    xs.sort((a, b) => a[1] - b[1]);
    const l = findVacant(xs);
    xs.push([s.id, l]);
    xs.sort((a, b) => a[1] - b[1]);
    ls[st][sx] = xs;
    if (s.start_time.getDay() !== s.end_time.getDay()) {
        for (i = st + 1; i < 48; i++) {
            ls[i][sx].push([s.id, l]);
            ls[i][sx].sort((a, b) => a[1] - b[1]);
        }
        for (j = sx + 1; j < ex; j++) {
            for (i = 0; i < 48; i++) {
                ls[i][j].push([s.id, l]);
                ls[i][j].sort((a, b) => a[1] - b[1]);
            }
        }
        for (i = 0; i < end; i++) {
            ls[i][ex].push([s.id, l]);
            ls[i][ex].sort((a, b) => a[1] - b[1]);
        }
    } else {
        for (i = st + 1; i < end; i++) {
            ls[i][sx].push([s.id, l]);
            ls[i][sx].sort((a, b) => a[1] - b[1]);
        }
    }
}

const calcLaneArray = (s: Shift[], startDate: Date): [number, number][][][] => {
    let rest = [...s];
    let dst: [number, number][][][] = seq(48).map((_) => seq(7).map((_) => []));
    rest.sort((a, b) => a.start_time.getTime() - b.start_time.getTime());
    while (rest.length >= 1) {
        const [y] = rest.splice(0, 1);
        insertLane(y, dst, startDate);
    }
    return dst;
}

export default function Schedule() {
    const history = useHistory();
    const classes = useStyles();
    const [data, setData] = useState<Shift[]>([]);
    const [currentDate, setDate] = useState(new Date());
    const startDate = toDate(addDay(currentDate, -currentDate.getDay()));
    const [users, setUsers] = useState<User[]>([]);
    const cells = useRef<any[][]>(seq(48).map((_) => seq(7).map((_) => undefined)));
    const anchors = useRef<number[][][]>(seq(49).map((_) => seq(7).map((_) => [-1, -1])));
    const [cw, setCw] = useState(100); // column width
    const [rh, setRh] = useState(25); // row height
    const [anchorEl, setAnchorEl] = useState<HTMLElement | undefined>(undefined);
    const postCallback = useRef((u: string) => async () => { });
    const drgSense = 15;
    const moveSense = 3;
    const defaultLength = 60 * 60 * 1000; // 1 hour
    const onResize = useCallback(() => {
        cells.current.forEach((v, i, _) =>
            v.forEach((r, j, _) => {
                if (r) {
                    let bd = r.ownerDocument.scrollingElement;
                    let { left, top } = r.getBoundingClientRect()
                    if (bd) {
                        anchors.current[i][j] = [left + bd.scrollLeft, top + bd.scrollTop];
                    }
                }
            }));
        const rect = cells.current[0][0].getBoundingClientRect();
        setCw(rect.width);
        setRh(rect.height);
        anchors.current[48].forEach((_u, i, _) => {
            anchors.current[48][i][0] = anchors.current[47][i][0] + cw;
            anchors.current[48][i][1] = anchors.current[47][i][1] + rh;
        });
    }, [setCw, setRh, rh, cw]);
    const { ref } = useResizeDetector({ onResize });
    useEffect(onResize, [onResize]);
    useEffect(() => {
        (async () => {
            if (!getToken()) {
                history.push('/login');
            }
            const startDate = toDate(addDay(currentDate, -currentDate.getDay()));
            const endDate = addDay(startDate, 7);
            const schs = await getSchedules(startDate, endDate);
            if (schs) setData(schs);
            const us = await getUsers();
            if (us) setUsers(us);
        })();
    }, [history, currentDate]);
    const lanes = calcLaneArray(data, startDate);
    const sch2boxes = (s: Shift, fix = true): [number, number, number, number][] => {
        const st = date2index(s.start_time);
        const end = date2index(s.end_time);
        const a = anchors.current;
        const w = 0.9 * cw;
        if (s.start_time.getDay() !== s.end_time.getDay()) {
            const sx = Math.floor((s.start_time.getTime() - startDate.getTime()) / day);
            const ex = Math.floor((s.end_time.getTime() - startDate.getTime()) / day);
            const ret = lanes[Math.floor(st)][Math.min(Math.max(sx, 0), 6)].find((x) => x[0] === s.id);
            let ln = 0;
            if (ret) ln = ret[1];
            const fb = fix ? iter(fixBox, ln) : Utils.id;
            let dst = [];
            if (sx < 7 && 0 <= sx) {
                const l = a[Math.floor(st)][sx][0] + (a[Math.floor(st) + 1][sx][0] - a[Math.floor(st)][sx][0]) * (st - Math.floor(st));
                const t = a[Math.floor(st)][sx][1] + (a[Math.floor(st) + 1][sx][1] - a[Math.floor(st)][sx][1]) * (st - Math.floor(st));
                const b = a[47][sx][1] + rh;
                dst.push(fb([l, t, w, b - t]));
            }
            let i;
            for (i = sx + 1; i < ex; i++) {
                if (i < 7 && 0 <= i) {
                    const l = a[0][i][0];
                    const t = a[0][i][1];
                    const b = a[47][i][1] + rh;
                    dst.push(fb([l, t, w, b - t]));
                }
            }
            if (ex < 7 && 0 <= ex) {
                const l = a[0][ex][0];
                const t = a[0][ex][1];
                const b = a[Math.floor(end)][ex][1] + (a[Math.floor(end) + 1][ex][1] - a[Math.floor(end)][ex][1]) * (end - Math.floor(end));
                dst.push(fb([l, t, w, b - t]));
            }
            return dst as [number, number, number, number][];
        } else {
            const x = Math.floor((s.start_time.getTime() - startDate.getTime()) / day);
            const ret = lanes[Math.floor(st)][Math.min(Math.max(x, 0), 6)].find((x) => x[0] === s.id);
            let ln = 0;
            if (ret) ln = ret[1];
            const fb = fix ? iter(fixBox, ln) : Utils.id;
            if (x < 7 && 0 <= x) {
                const l = a[Math.floor(st)][x][0] + (a[Math.floor(st) + 1][x][0] - a[Math.floor(st)][x][0]) * (st - Math.floor(st));
                const t = a[Math.floor(st)][x][1] + (a[Math.floor(st) + 1][x][1] - a[Math.floor(st)][x][1]) * (st - Math.floor(st));
                const b = a[Math.floor(end)][x][1] + (a[Math.floor(end) + 1][x][1] - a[Math.floor(end)][x][1]) * (end - Math.floor(end));
                return [fb([l, t, w, b - t])];
            } else {
                return [];
            }
        }
    }

    const shift2zindex = (s: Shift) => {
        const st = Math.floor(date2index(s.start_time));
        const sx = Math.min(Math.max(Math.floor((s.start_time.getTime() - startDate.getTime()) / day), 0), 6);
        const ret = lanes[st][sx].find((x) => x[0] === s.id);
        let ln = 0;
        if (ret) ln = ret[1];
        return ln + 1;
    }

    const procXY = useCallback(([[x, ox], [y, oy]]: [[number, number], [number, number]]) => {
        const a = anchors.current;
        const i = Math.min(6, Math.max(0, Math.floor((x + ox - a[0][0][0]) / cw)));
        const nx = i * cw + a[0][0][0];
        return [nx, y] as [number, number];
    }, [cw]);

    const onDelete = useCallback(async (s: Shift) => {
        const t = getToken();
        setData(data.filter((x) => x.id !== s.id));
        const ret = await deleteSchedule(s.id);
        if (!ret && !t) {
            history.push('/login');
        }
    }, [data, history]);

    const onDisable = useCallback(async (s: Shift) => {
        const i = data.findIndex((x) => x.id === s.id);
        let nd = [...data];
        nd[i] = { ...s, enable: false };
        setData(nd);
        let ret = await Utils.disableSchedule(s.id);
        const t = getToken();
        if (!ret && !t) {
            history.push('/login');
        } else if (!ret) {
            alert("error");
        }
    }, [data, history]);

    const onPermit = useCallback(async (s: Shift) => {
        const i = data.findIndex((x) => x.id === s.id);
        let nd = [...data];
        nd[i] = { ...s, permitted: true };
        setData(nd);
        let ret = await Utils.permitSchedule(s.id);
        const t = getToken();
        if (!ret && !t) {
            history.push('/login');
        } else if (!ret) {
            alert("error");
        }
    }, [data, history]);

    const onAbsent = useCallback(async (s: Shift) => {
        const t = getToken();
        const i = data.findIndex((x) => x.id === s.id);
        let nd = [...data];
        if (t && decodeJwt(t).isadmin && s.absent) {
            nd[i] = { ...s, absent: false };
        } else {
            nd[i] = { ...s, absent: true };
        }
        setData(nd);
        let ret = await Utils.absentSchedule(s.id);
        if (!ret && !t) {
            history.push('/login');
        } else if (!ret) {
            alert("error");
        }
    }, [data, history]);

    const onUp = useCallback(async (s: Shift) => {
        if (s.permitted) {
            alert('許可されたシフトは変更できません'); // todo: replace
            setData([...data]);
            return;
        }
        const t = getToken();
        if (t && s.created_by !== decodeJwt(t).user) {
            alert('他人の作成したシフトは変更できません'); // todo: replace
            setData([...data]);
            return;
        }
        const i = data.findIndex((x) => x.id === s.id);
        let nd = [...data];
        nd[i] = s;
        setData(nd);
        const ret = await updateSchedule(s.id, s.start_time, s.end_time);
        if (!ret && !getToken()) {
            history.push('/login');
        }
    }, [history, data]);

    const MultiBox = ({ shift }: { shift: Shift }) => {
        const [sft, setSft] = useState(shift);
        const sch = useRef(shift);
        const sel = useRef(0);
        const isDrg = useRef(false);
        const isRsz = useRef(false);
        const isUp = useRef(false);
        const ox = useRef(0);
        const oy = useRef(0);
        const x = useRef(0);
        const y = useRef(0);
        const [px, setPx] = useState(0);
        const [py, setPy] = useState(0);
        const [anchorEl, setAnchorEl] = useState<HTMLElement | undefined>(undefined);
        useEffect(() => {
            sch.current = shift;
            setSft(shift);
        }, [shift]);

        const handleClick = (w: number, h: number) => (event: React.MouseEvent<HTMLDivElement>) => {
            setPx(w);
            setPy(h);
            setAnchorEl(event.currentTarget.ownerDocument.body);
        };

        const handleClose = useCallback(() => setAnchorEl(undefined), []);

        const onMove = async (e: any) => {
            if (!isDrg.current && !isRsz.current) return;
            let bd = e.target.ownerDocument.scrollingElement;
            const [px, py] = procXY([[e.clientX + bd.scrollLeft - ox.current, ox.current], [e.clientY + bd.scrollTop - oy.current, oy.current]]);
            const bxs = sch2boxes(sft, false);
            const x = bxs[sel.current][0];
            const y = bxs[sel.current][1];
            let dx = (px - x) / cw;
            let dy = (py - y) / rh;
            dy = index2unixtime(dy);
            if (isDrg.current) {
                const start_time = new Date(sft.start_time.getTime() + dy + dx * day);
                const end_time = new Date(sft.end_time.getTime() + dy + dx * day);
                const s = { ...sft, start_time, end_time };
                setSft(s);
                sch.current = s;
            } else if (isRsz.current) {
                const end_time = new Date(sft.end_time.getTime() + dy);
                const s = { ...sft, end_time };
                setSft(s);
                sch.current = s;
            }
        };
        const _onUp = async (e: any) => {
            ox.current = 0;
            oy.current = 0;
            let el = e.target.ownerDocument;
            el.removeEventListener('mousemove', onMove, { capture: true });
            el.removeEventListener('mouseup', _onUp, { capture: true });
            if (!isUp.current) {
                isUp.current = true;
                const d = (x.current - e.clientX) ** 2 + (y.current - e.clientY) ** 2;
                if (d > moveSense || !isDrg.current) await onUp(sch.current);
            }
            isDrg.current = false;
            isRsz.current = false;
        };
        const _onDown = (i: number) => async (e: any) => {
            ox.current = e.nativeEvent.offsetX;
            oy.current = e.nativeEvent.offsetY;
            x.current = e.clientX;
            y.current = e.clientY;
            sel.current = i;
            isUp.current = false;
            isRsz.current = false;
            isDrg.current = true;
            const bxs = sch2boxes(sft);
            if (i === bxs.length - 1) {
                const [x, y, w, h] = bxs[i];
                let bd = e.target.ownerDocument.scrollingElement;
                if (Math.abs(e.clientY + bd.scrollTop - (y + h)) < drgSense && Math.abs(e.clientX + bd.scrollLeft - (x + w)) < cw) {
                    isRsz.current = true;
                    isDrg.current = false;
                }
            }
            let el = e.target.ownerDocument;
            el.addEventListener('mouseup', _onUp, { capture: true });
            el.addEventListener('mousemove', onMove, { capture: true });
        };

        const stChange = async (start_time: Date | null) => {
            if (!start_time) return;
            const s = { ...sft, start_time };
            await onUp(s);
        }

        const edChange = async (end_time: Date | null) => {
            if (!end_time) return;
            const s = { ...sft, end_time };
            await onUp(s);
        }

        const deleteSft = async () => {
            await onDelete(sch.current);
        }

        const disableSft = async () => {
            await onDisable(sch.current);
        }

        const permitSft = async () => {
            await onPermit(sch.current);
        }

        const absentSft = async () => {
            await onAbsent(sch.current);
        }

        const open = Boolean(anchorEl);
        const id = open ? `multibox-popover${sft.id}` : undefined;
        const token = getToken();
        const isadmin = token ? decodeJwt(token).isadmin : false;
        const user = token ? decodeJwt(token).user : undefined;

        return (
            <div>
                <div>
                    {sch2boxes(sft).map((b, i, _) => {
                        const [x, y, w, h] = b;
                        return (<Box aria-describedby={id} width={w} height={h} boxShadow={3} style={{ userSelect: 'none', }} sx={{ zIndex: shift2zindex(sft), bgcolor: "red", position: 'absolute', left: x, top: y, }} onMouseDown={_onDown(i)} onDoubleClick={handleClick(x + 0.5 * w, y)} onMouseUp={_onUp}>{i === 0 ? sft.username : undefined}</Box>);
                    })}
                </div>
                <Popover
                    id={id}
                    open={open}
                    anchorEl={anchorEl}
                    onClose={handleClose}
                    anchorPosition={{ left: px, top: py }}
                    anchorReference='anchorPosition'
                    anchorOrigin={{
                        vertical: 'top',
                        horizontal: 'center',
                    }}
                    transformOrigin={{
                        vertical: 'top',
                        horizontal: 'right',
                    }}
                >
                    <Toolbar style={{ justifyContent: "flex-end" }}>
                        {
                            sft.enable && (!sft.permitted || sft.absent) && (isadmin || (sft.created_by !== sft.username && sft.username === user)) ?
                                <IconButton color="inherit" onClick={disableSft}>
                                    <BlockIcon />
                                </IconButton>
                                : undefined
                        }
                        {
                            !sft.permitted && sft.created_by === user ?
                                <IconButton color="inherit" onClick={deleteSft}>
                                    <DeleteIcon />
                                </IconButton>
                                : undefined
                        }
                        {
                            sft.enable && sft.permitted && sft.username === user ?
                                <IconButton color="inherit" onClick={absentSft}>
                                    <HealingIcon />
                                </IconButton>
                                : undefined
                        }
                        {
                            sft.enable && !sft.permitted && (isadmin || sft.username === user) ?
                                <IconButton color="inherit" onClick={permitSft}>
                                    <AssignmentIcon />
                                </IconButton>
                                : undefined
                        }
                        <IconButton color="inherit" onClick={handleClose}>
                            <CloseIcon />
                        </IconButton>
                    </Toolbar>
                    <MuiPickersUtilsProvider utils={DateFnsUtils}>
                        <Grid container justifyContent="space-around">
                            <KeyboardDateTimePicker value={sft.start_time} onChange={stChange} />
                            <KeyboardDateTimePicker value={sft.end_time} onChange={edChange} />
                        </Grid>
                    </MuiPickersUtilsProvider>
                    <Typography>{sft.username}</Typography>
                    <Typography>{sft.created_by}</Typography>
                    <Typography>{sft.permitted.toString()}</Typography>
                    <Typography>{sft.absent.toString()}</Typography>
                    <Typography>{sft.enable.toString()}</Typography>
                    {!sft.enable ? <Typography>拒否</Typography> : undefined}
                    {sft.absent ? <Typography>欠勤希望</Typography> : undefined}
                </Popover>
            </div>
        );
    }

    const popoverClose = useCallback(() => setAnchorEl(undefined), []);
    const onClickCell = useCallback((i: number, day: number) => async () => {
        const start_time = new Date(addDay(startDate, day).getTime() + index2unixtime(i));
        const end_time = new Date(start_time.getTime() + defaultLength);
        const t = getToken();
        if (t) {
            const a: boolean = decodeJwt(t).isadmin;
            const u: string = decodeJwt(t).user;
            if (!a) {
                const id = await postSchedule(u, start_time, end_time);
                if (id) {
                    let nd = [...data];
                    nd.push({ start_time, end_time, id, permitted: false, absent: false, enable: true, created_by: u, username: u })
                    setData(nd);
                }
            } else {
                postCallback.current = (target: string) => async () => {
                    const id = await postSchedule(target, start_time, end_time);
                    if (id) {
                        let nd = [...data];
                        nd.push({ start_time, end_time, id, permitted: false, absent: false, enable: true, created_by: u, username: target })
                        setData(nd);
                    }
                    popoverClose();
                }
                setAnchorEl(cells.current[i][day]);
            }
        } else {
            history.push('/login');
        }
    }, [startDate, defaultLength, data, history, popoverClose]);

    const prev = useCallback(() => {
        setData([]);
        setDate(addDay(currentDate, -7));
    }, [currentDate]);

    const next = useCallback(() => {
        setData([]);
        setDate(addDay(currentDate, 7));
    }, [currentDate]);

    const open = Boolean(anchorEl);
    const id = open ? `schedule-popover` : undefined;

    return (
        <>
            <Toolbar>
                <IconButton color="inherit" onClick={prev}>
                    <NavigateBeforeIcon />
                </IconButton>
                <IconButton color="inherit" onClick={next}>
                    <NavigateNextIcon />
                </IconButton>
            </Toolbar>
            <Paper ref={ref}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell />
                            {seq(7).map((j) => <TableCell className={classes.tableHead} width={cw}>{addDay(startDate, j).getDate()}</TableCell>)}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {seq(48).map((i) => {
                            return (
                                <TableRow className={classes.tableRow}>
                                    <TableCell className={classes.tableTime} style={{ transform: `translateY(${-rh / 2}px)` }}>{timeFormat(new Date(index2unixtime(i)))}</TableCell>
                                    {seq(7).map((j) => <TableCell ref={(r) => { cells.current[i][j] = r }} className={classes.tableCell} width={cw} onClick={onClickCell(i, j)} />)}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
                <Popover
                    id={id}
                    open={open}
                    anchorEl={anchorEl}
                    onClose={popoverClose}
                    anchorOrigin={{
                        vertical: 'top',
                        horizontal: 'center',
                    }}
                    transformOrigin={{
                        vertical: 'top',
                        horizontal: 'right',
                    }}
                >
                    <List>
                        {users.map((u) => <ListItem button onClick={postCallback.current(u.id)}><ListItemText primary={u.id} /></ListItem>)}
                    </List>
                </Popover>
            </Paper>
            <div>{data.map((s) => <MultiBox shift={s} />)}</div>
        </>
    );
}
