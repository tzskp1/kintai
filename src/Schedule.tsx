import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import Paper from '@material-ui/core/Paper';
import AppBar from '@material-ui/core/AppBar';
import CssBaseline from '@material-ui/core/CssBaseline';
import Divider from '@material-ui/core/Divider';
import Drawer from '@material-ui/core/Drawer';
import Hidden from '@material-ui/core/Hidden';
import IconButton from '@material-ui/core/IconButton';
import InboxIcon from '@material-ui/icons/MoveToInbox';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import MailIcon from '@material-ui/icons/Mail';
import MenuIcon from '@material-ui/icons/Menu';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableRow from '@material-ui/core/TableRow';
import { makeStyles, useTheme, Theme, createStyles } from '@material-ui/core/styles';
import { BrowserRouter, Route, Switch, Redirect, Link } from "react-router-dom";
import Box from '@material-ui/core/Box';
import { sizing, palette, positions } from '@material-ui/system';
import { getSchedules, seq, Shift, day, updateSchedule } from './Utils';
import { useResizeDetector } from 'react-resize-detector';

const drawerWidth = 240;

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

interface Props {
    /**
     * Injected by the documentation to work in an iframe.
     * You won't need it on your project.
     */
    window?: () => Window;
}

const addDay = (d: Date, days: number) => {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

const toDate = (d: Date) => {
    let t = new Date(d);
    t.setHours(0);
    t.setMinutes(0);
    t.setSeconds(0);
    t.setMilliseconds(0);
    return t;
}

type MultiBoxProp = {
    onDown?: (_: Shift) => Promise<void>,
    onUp?: (_: Shift) => Promise<void>,
    shift: Shift
}

const date2index = (d: Date) => {
    let t = d.getTime() - toDate(d).getTime();
    return t / (30 * 60 * 1000);
}

const index2unixtime = (i: number) => {
    return i * (30 * 60 * 1000);
}

export default function Schedule(props: Props) {
    const [data, setData] = useState<Shift[]>([]);
    const [currentDate, setDate] = useState(new Date());
    const startDate = toDate(addDay(currentDate, -currentDate.getDay()));
    const classes = useStyles();
    const cells = useRef<any[][]>(seq(48).map((_) => seq(7).map((_) => undefined)));
    const anchors = useRef<number[][][]>(seq(49).map((_) => seq(7).map((_) => [-1, -1])));
    const [cw, setCw] = useState(100); // column width
    const [rh, setRh] = useState(50); // row height
    const drgSense = 15;
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
        anchors.current[48].forEach((_u, i, _) => {
            anchors.current[48][i][0] = anchors.current[47][i][0] + cw;
            anchors.current[48][i][1] = anchors.current[47][i][1] + rh;
        });
        setCw(rect.width);
        setRh(rect.height);
    }, [setCw, setRh, rh, cw]);
    const { ref } = useResizeDetector({ onResize });
    useEffect(onResize, [onResize]);
    useEffect(() => {
        (async () => {
            let schs = await getSchedules();
            if (schs) setData(schs);
        })();
    }, []);
    const sch2boxes = (s: Shift): [number, number, number, number][] => {
        const st = date2index(s.start_time);
        const end = date2index(s.end_time);
        const a = anchors.current;
        if (s.start_time.getDay() !== s.end_time.getDay()) {
            const sx = Math.floor((s.start_time.getTime() - startDate.getTime()) / day);
            const ex = Math.floor((s.end_time.getTime() - startDate.getTime()) / day);
            let dst = [];
            if (sx < 7 && 0 <= sx) {
                const l = a[Math.floor(st)][sx][0] + (a[Math.floor(st) + 1][sx][0] - a[Math.floor(st)][sx][0]) * (st - Math.floor(st));
                const t = a[Math.floor(st)][sx][1] + (a[Math.floor(st) + 1][sx][1] - a[Math.floor(st)][sx][1]) * (st - Math.floor(st));
                const b = a[47][sx][1] + rh;
                dst.push([l, t, cw, b - t]);
            }
            let i;
            for (i = sx + 1; i < ex; i++) {
                if (i < 7 && 0 <= i) {
                    const l = a[0][i][0];
                    const t = a[0][i][1];
                    const b = a[47][i][1] + rh;
                    dst.push([l, t, cw, b - t]);
                }
            }
            if (ex < 7 && 0 <= ex) {
                const l = a[0][ex][0];
                const t = a[0][ex][1];
                const b = a[Math.floor(end)][ex][1] + (a[Math.floor(end) + 1][ex][1] - a[Math.floor(end)][ex][1]) * (end - Math.floor(end));
                dst.push([l, t, cw, b - t]);
            }
            return dst as [number, number, number, number][];
        } else {
            const x = s.start_time.getDay() - startDate.getDay();
            if (x < 7 && 0 <= x) {
                const l = a[Math.floor(st)][x][0] + (a[Math.floor(st) + 1][x][0] - a[Math.floor(st)][x][0]) * (st - Math.floor(st));
                const t = a[Math.floor(st)][x][1] + (a[Math.floor(st) + 1][x][1] - a[Math.floor(st)][x][1]) * (st - Math.floor(st));
                const b = a[Math.floor(end)][x][1] + (a[Math.floor(end) + 1][x][1] - a[Math.floor(end)][x][1]) * (end - Math.floor(end));
                return [[l, t, cw, b - t]];
            } else {
                return [];
            }
        }
    }

    const procXY = useCallback(([[x, ox], [y, oy]]: [[number, number], [number, number]]) => {
        const a = anchors.current;
        const i = Math.min(6, Math.max(0, Math.floor((x + Math.min(ox, 0.5 * cw) - a[0][0][0]) / cw)));
        const nx = i * cw + a[0][0][0];
        return [nx, y] as [number, number];
    }, [cw]);

    const MultiBox = ({ shift, onUp = (x) => { return new Promise(() => { return; }); }, onDown = (x) => { return new Promise(() => { return; }); } }: MultiBoxProp) => {
        const [sft, setSft] = useState(shift);
        const sel = useRef(0);
        const isDrg = useRef(false);
        const isRsz = useRef(false);
        const ox = useRef(0);
        const oy = useRef(0);
        useEffect(() => setSft(shift), [shift]);
        const onMove = async (e: any) => {
            console.log(isRsz.current);
            if (!isDrg.current && !isRsz.current) return;
            let bd = e.target.ownerDocument.scrollingElement;
            const [px, py] = procXY([[e.clientX + bd.scrollLeft - ox.current, ox.current], [e.clientY + bd.scrollTop - oy.current, oy.current]]);
            const bxs = sch2boxes(sft);
            const x = bxs[sel.current][0];
            const y = bxs[sel.current][1];
            let dx = (px - x) / cw;
            let dy = (py - y) / rh;
            dy = index2unixtime(dy);
            if (isDrg.current) {
                const start_time = new Date(sft.start_time.getTime() + dy + dx * day);
                const end_time = new Date(sft.end_time.getTime() + dy + dx * day);
                setSft({ ...sft, start_time, end_time });
            } else if (isRsz.current) {
                const end_time = new Date(sft.end_time.getTime() + dy);
                setSft({ ...sft, end_time });
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
            await onUp(sft);
        };
        const _onDown = (i: number) => async (e: any) => {
            ox.current = e.nativeEvent.offsetX;
            oy.current = e.nativeEvent.offsetY;
            sel.current = i;
            isDrg.current = true;
            const bxs = sch2boxes(sft);
            if (i === bxs.length - 1) {
                const [x, y, w, h] = bxs[i];
                const dy = e.clientY - (y + h);
                if (dy < drgSense && Math.abs(e.clientX - (x + w)) < cw) {
                    isDrg.current = false;
                    isRsz.current = true;
                }
            }
            let el = e.target.ownerDocument;
            el.addEventListener('mouseup', _onUp, { capture: true });
            el.addEventListener('mousemove', onMove, { capture: true });
            await onDown(sft);
        };
        return (
            <div>
                {sch2boxes(sft).map((b, i, _) => {
                    const [x, y, w, h] = b;
                    return (<Box width={w} height={h} sx={{ bgcolor: "red", position: 'absolute', left: x, top: y, }} onMouseDown={_onDown(i)} onMouseUp={_onUp} />);
                })}
            </div>
        );
    }

    return (
        <>
            <Paper ref={ref}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell style={{ borderLeft: '1px solid' }} width={cw}>{startDate.getDate()}</TableCell>
                            <TableCell style={{ borderLeft: '1px solid' }} width={cw}>{addDay(startDate, 1).getDate()}</TableCell>
                            <TableCell style={{ borderLeft: '1px solid' }} width={cw}>{addDay(startDate, 2).getDate()}</TableCell>
                            <TableCell style={{ borderLeft: '1px solid' }} width={cw}>{addDay(startDate, 3).getDate()}</TableCell>
                            <TableCell style={{ borderLeft: '1px solid' }} width={cw}>{addDay(startDate, 4).getDate()}</TableCell>
                            <TableCell style={{ borderLeft: '1px solid' }} width={cw}>{addDay(startDate, 5).getDate()}</TableCell>
                            <TableCell style={{ borderLeft: '1px solid' }} width={cw}>{addDay(startDate, 6).getDate()}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {seq(48).map((i) => {
                            return (
                                <TableRow >
                                    <TableCell ref={(r) => { cells.current[i][0] = r }} style={{ borderLeft: '1px solid' }} width={cw} />
                                    <TableCell ref={(r) => { cells.current[i][1] = r }} style={{ borderLeft: '1px solid' }} width={cw} />
                                    <TableCell ref={(r) => { cells.current[i][2] = r }} style={{ borderLeft: '1px solid' }} width={cw} />
                                    <TableCell ref={(r) => { cells.current[i][3] = r }} style={{ borderLeft: '1px solid' }} width={cw} />
                                    <TableCell ref={(r) => { cells.current[i][4] = r }} style={{ borderLeft: '1px solid' }} width={cw} />
                                    <TableCell ref={(r) => { cells.current[i][5] = r }} style={{ borderLeft: '1px solid' }} width={cw} />
                                    <TableCell ref={(r) => { cells.current[i][6] = r }} style={{ borderLeft: '1px solid' }} width={cw} />
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
