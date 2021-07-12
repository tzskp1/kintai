import React, { useState } from 'react';
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
import { makeStyles, useTheme, Theme, createStyles } from '@material-ui/core/styles';
import { BrowserRouter, Route, Switch, Redirect, Link } from "react-router-dom";
import { ViewState, EditingState, IntegratedEditing, ChangeSet } from '@devexpress/dx-react-scheduler';
import {
    Scheduler,
    Appointments,
    EditRecurrenceMenu,
    AppointmentTooltip,
    AppointmentForm,
    WeekView,
    DragDropProvider,
} from '@devexpress/dx-react-scheduler-material-ui';

const drawerWidth = 240;

const useStyles = makeStyles((theme: Theme) =>
    createStyles({
        root: {
            display: 'flex',
        },
        drawer: {
            [theme.breakpoints.up('sm')]: {
                width: drawerWidth,
                flexShrink: 0,
            },
        },
        appBar: {
            [theme.breakpoints.up('sm')]: {
                width: `calc(100% - ${drawerWidth}px)`,
                marginLeft: drawerWidth,
            },
        },
        menuButton: {
            marginRight: theme.spacing(2),
            [theme.breakpoints.up('sm')]: {
                display: 'none',
            },
        },
        // necessary for content to be below app bar
        toolbar: theme.mixins.toolbar,
        drawerPaper: {
            width: drawerWidth,
        },
        content: {
            flexGrow: 1,
            padding: theme.spacing(3),
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
type Shift = {
    startDate: Date;
    endDate: Date;
    id: number
}

const appointments = [
    {
        startDate: new Date(2021, 7, 13, 9, 35),
        endDate: new Date(2021, 7, 14, 11, 30),
        id: 0,
    }
];

export default function Schedule(props: Props) {
    const [data, setData] = useState<Shift[]>(appointments);
    const [currentDate, setDate] = useState(new Date().toISOString().split("T")[0]);
    const [isShiftPressed, setShiftPressed] = useState(false);
    const commitChanges = ({ added, changed, deleted }: ChangeSet) => {
        let d = data;
        if (added) {
            const startingAddedId = d.length > 0 ? d[d.length - 1].id + 1 : 0;
            // todo: erase 'as'
            d = [...d, { ...added as Shift, id: startingAddedId }];
        }
        if (changed) {
            if (isShiftPressed) {
                const changedAppointment = d.find(appointment => changed[appointment.id]);
                const startingAddedId = d.length > 0 ? d[d.length - 1].id + 1 : 0;
                if (changedAppointment) {
                    d = [...d,
                    { ...changedAppointment, ...changed[changedAppointment.id], id: startingAddedId },
                    ];
                }
            } else {
                d = d.map(appointment => (
                    changed[appointment.id]
                        ? { ...appointment, ...changed[appointment.id] }
                        : appointment));
            }
        }
        if (deleted !== undefined) {
            d = d.filter(appointment => appointment.id !== deleted);
        }
        setData(d);
    };
    return (
        <Paper>
            <Scheduler data={data} >
                <ViewState currentDate={currentDate} />
                <EditingState onCommitChanges={commitChanges} />
                <IntegratedEditing />
                <WeekView startDayHour={0} endDayHour={24} />
                <EditRecurrenceMenu />
                <Appointments />
                <AppointmentTooltip showDeleteButton />
                <AppointmentTooltip showOpenButton showDeleteButton />
                <AppointmentForm />
            </Scheduler>
        </Paper>
    );
}
