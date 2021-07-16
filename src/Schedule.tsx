import React, { useState, useRef, useEffect, useCallback } from 'react';
import Paper from '@material-ui/core/Paper';
import CssBaseline from '@material-ui/core/CssBaseline';
import Divider from '@material-ui/core/Divider';
import Hidden from '@material-ui/core/Hidden';
import IconButton from '@material-ui/core/IconButton';
import InboxIcon from '@material-ui/icons/MoveToInbox';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import MailIcon from '@material-ui/icons/Mail';
import MenuIcon from '@material-ui/icons/Menu';
import Typography from '@material-ui/core/Typography';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import { makeStyles, useTheme, Theme, createStyles } from '@material-ui/core/styles';
import Box from '@material-ui/core/Box';
import { sizing, palette, positions } from '@material-ui/system';
import { getSchedules, seq, Shift, day, updateSchedule, getToken, addDay, toDate, timeFormat, postSchedule, decodeJwt, iter, id } from './Utils';
import { useResizeDetector } from 'react-resize-detector';
import { useHistory } from 'react-router-dom';

const useStyles = makeStyles((theme: Theme) =>
    createStyles({
        rowOverlayHover: {
            width: '0',
            padding: '0 !important',
        },
        overlayWrapper: {
            position: 'relative',
        },
        overlayContent: {
            visibility: 'hidden',
            position: 'absolute',
            right: '0',
        },
    }),
);

type MultiBoxProp = {
    onDown?: (_: Shift) => Promise<void>,
    shift: Shift
}

const date2index = (d: Date) => {
    let t = d.getTime() - toDate(d).getTime();
    return t / (30 * 60 * 1000);
}

const index2unixtime = (i: number) => {
    return i * (30 * 60 * 1000);
}

export default function Schedule() {
    const history = useHistory();
    const classes = useStyles();
    const [data, setData] = useState<Shift[]>([]);
    const [currentDate, setDate] = useState(new Date());
    const startDate = toDate(addDay(currentDate, -currentDate.getDay()));
    const cells = useRef<any[][]>(seq(48).map((_) => seq(7).map((_) => undefined)));
    const anchors = useRef<number[][][]>(seq(49).map((_) => seq(7).map((_) => [-1, -1])));
    const [cw, setCw] = useState(100); // column width
    const [rh, setRh] = useState(25); // row height
    const drgSense = 15;
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
        let rect = cells.current[0][0].getBoundingClientRect();
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
            let schs = await getSchedules();
            if (schs) setData(schs);
        })();
    }, [history]);
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
    const insertLane = (s: Shift, ls: [number, number][][][]) => {
        const st = Math.floor(date2index(s.start_time));
        const end = Math.floor(date2index(s.end_time));
        const sx = Math.floor((s.start_time.getTime() - startDate.getTime()) / day);
        const ex = Math.floor((s.end_time.getTime() - startDate.getTime()) / day);

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
    const calcLaneArray = (s: Shift[]): [number, number][][][] => {
        let rest = [...s];
        let dst: [number, number][][][] = seq(48).map((_) => seq(7).map((_) => []));
        rest.sort((a, b) => a.start_time.getTime() - b.start_time.getTime());
        while (rest.length >= 1) {
            const [y] = rest.splice(0, 1);
            insertLane(y, dst);
        }
        return dst;
    }
    const lanes = calcLaneArray(data);
    const fixBox = (b: [number, number, number, number]): [number, number, number, number] => {
        const r = 0.8;
        const [x, y, w, h] = b;
        return [x + w * (1 - r), y, w * r, h];
    }
    const sch2boxes = (s: Shift, fix = true): [number, number, number, number][] => {
        const st = date2index(s.start_time);
        const end = date2index(s.end_time);
        const a = anchors.current;
        const w = 0.9 * cw;
        if (s.start_time.getDay() !== s.end_time.getDay()) {
            const sx = Math.floor((s.start_time.getTime() - startDate.getTime()) / day);
            const ex = Math.floor((s.end_time.getTime() - startDate.getTime()) / day);
            const ret = lanes[Math.floor(st)][sx].find((x) => x[0] === s.id);
            let ln = 0;
            if (ret) ln = ret[1];
            const fb = fix ? iter(fixBox, ln) : id;
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
            const ret = lanes[Math.floor(st)][x].find((x) => x[0] === s.id);
            let ln = 0;
            if (ret) ln = ret[1];
            const fb = fix ? iter(fixBox, ln) : id;
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

    const date2zindex = (d: Date) => {
        return Math.floor((d.getTime() - startDate.getTime()) / (60 * 1000));
    }

    const procXY = useCallback(([[x, ox], [y, oy]]: [[number, number], [number, number]]) => {
        const a = anchors.current;
        const i = Math.min(6, Math.max(0, Math.floor((x + ox - a[0][0][0]) / cw)));
        const nx = i * cw + a[0][0][0];
        return [nx, y] as [number, number];
    }, [cw]);

    const onUp = useCallback(async (s: Shift) => {
        if (s.permitted) {
            alert('許可されたシフトは変更できません'); // todo: replace
            setData(data);
            return;
        }
        const t = getToken();
        if (t && s.username !== decodeJwt(t).user) {
            alert('他人のシフトは変更できません'); // todo: replace
            setData(data);
            return;
        }
        const ret = await updateSchedule(s.id, s.start_time, s.end_time);
        if (ret) {
            const i = data.findIndex((x) => x.id === s.id);
            let nd = [...data];
            nd[i] = s;
            setData(nd);
        } else if (!getToken()) {
            history.push('/login');
        }
    }, [history, data]);

    const MultiBox = ({ shift, onDown = (x) => { return new Promise(() => { return; }); } }: MultiBoxProp) => {
        const [sft, setSft] = useState(shift);
        const sch = useRef(shift);
        const sel = useRef(0);
        const isDrg = useRef(false);
        const isRsz = useRef(false);
        const isUp = useRef(false);
        const ox = useRef(0);
        const oy = useRef(0);
        useEffect(() => {
            sch.current = shift;
            setSft(shift);
        }, [shift]);
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
            isDrg.current = false;
            isRsz.current = false;
            let el = e.target.ownerDocument;
            el.removeEventListener('mousemove', onMove, { capture: true });
            el.removeEventListener('mouseup', _onUp, { capture: true });
            if (!isUp.current) {
                isUp.current = true;
                await onUp(sch.current);
            }
        };
        const _onDown = (i: number) => async (e: any) => {
            ox.current = e.nativeEvent.offsetX;
            oy.current = e.nativeEvent.offsetY;
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
            await onDown(sch.current);
        };
        return (
            <div>
                {sch2boxes(sft).map((b, i, _) => {
                    const [x, y, w, h] = b;
                    return (<Box width={w} height={h} boxShadow={3} style={{ userSelect: 'none', }} sx={{ zIndex: date2zindex(sft.start_time) /* todo: care about end_time */, bgcolor: "red", position: 'absolute', left: x, top: y, }} onMouseDown={_onDown(i)} onMouseUp={_onUp} >{i === 0 ? sft.username : undefined}</Box>);
                })}
            </div>
        );
    }

    const onClickCell = useCallback((i: number, day: number) => async () => {
        const start_time = new Date(addDay(startDate, day).getTime() + index2unixtime(i));
        const end_time = new Date(start_time.getTime() + defaultLength);
        const id = await postSchedule(start_time, end_time);
        const t = getToken();
        if (id && t) {
            let nd = [...data];
            nd.push({ start_time, end_time, id, permitted: false, absent: false, username: decodeJwt(t).user })
            setData(nd);
        }
    }, [startDate, defaultLength, data]);

    return (
        <>
            <Paper ref={ref}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell />
                            <TableCell style={{ userSelect: 'none', borderLeft: '1px solid' }} width={cw}>{startDate.getDate()}</TableCell>
                            <TableCell style={{ userSelect: 'none', borderLeft: '1px solid' }} width={cw}>{addDay(startDate, 1).getDate()}</TableCell>
                            <TableCell style={{ userSelect: 'none', borderLeft: '1px solid' }} width={cw}>{addDay(startDate, 2).getDate()}</TableCell>
                            <TableCell style={{ userSelect: 'none', borderLeft: '1px solid' }} width={cw}>{addDay(startDate, 3).getDate()}</TableCell>
                            <TableCell style={{ userSelect: 'none', borderLeft: '1px solid' }} width={cw}>{addDay(startDate, 4).getDate()}</TableCell>
                            <TableCell style={{ userSelect: 'none', borderLeft: '1px solid' }} width={cw}>{addDay(startDate, 5).getDate()}</TableCell>
                            <TableCell style={{ userSelect: 'none', borderLeft: '1px solid' }} width={cw}>{addDay(startDate, 6).getDate()}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {seq(48).map((i) => {
                            return (
                                <TableRow style={{ height: '25px' }}>
                                    <TableCell style={{ userSelect: 'none', transform: `translateY(${-rh / 2}px)`, padding: "0px 16px" }}>{timeFormat(new Date(index2unixtime(i)))}</TableCell>
                                    <TableCell ref={(r) => { cells.current[i][0] = r }} style={{ borderLeft: '1px solid', padding: "0px 16px" }} width={cw} onClick={onClickCell(i, 0)} />
                                    <TableCell ref={(r) => { cells.current[i][1] = r }} style={{ borderLeft: '1px solid', padding: "0px 16px" }} width={cw} onClick={onClickCell(i, 1)} />
                                    <TableCell ref={(r) => { cells.current[i][2] = r }} style={{ borderLeft: '1px solid', padding: "0px 16px" }} width={cw} onClick={onClickCell(i, 2)} />
                                    <TableCell ref={(r) => { cells.current[i][3] = r }} style={{ borderLeft: '1px solid', padding: "0px 16px" }} width={cw} onClick={onClickCell(i, 3)} />
                                    <TableCell ref={(r) => { cells.current[i][4] = r }} style={{ borderLeft: '1px solid', padding: "0px 16px" }} width={cw} onClick={onClickCell(i, 4)} />
                                    <TableCell ref={(r) => { cells.current[i][5] = r }} style={{ borderLeft: '1px solid', padding: "0px 16px" }} width={cw} onClick={onClickCell(i, 5)} />
                                    <TableCell ref={(r) => { cells.current[i][6] = r }} style={{ borderLeft: '1px solid', padding: "0px 16px" }} width={cw} onClick={onClickCell(i, 6)} />
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </Paper>
            <div>{data.map((s) => <MultiBox shift={s} />)}</div>
        </>
    );
}
