import express, { NextFunction, Response } from 'express';
import graphqlHTTP from 'express-graphql';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import cors from 'cors';

import { schema } from './lib/gql/schema';
import { db } from './models';
import { claimNextUserId, sessionStore } from './lib/server-state';
import { resetServerState } from './lib/reset-state';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

async function GetCurrentUser(req: any, res: Response, next: NextFunction) {
    if (!req.session.user_id) {
        req.session.user_id = claimNextUserId();
        console.log("Assigned user ID", req.session.user_id);
    }

    let user = await db.User.findByPk(req.session.user_id);
    req.user = user;
    next();
}

app.use(session(
    {
        secret: "a very good and secure secret",
        resave: false,
        saveUninitialized: false,
        store: sessionStore
    }
));

app.use(GetCurrentUser);

// Set up rate-limiting.
// We wouldn't want anyone brute-forcing password reset tokens!
const limiter = rateLimit({
    windowMs:60 * 1000, // one minute
    max: 100 // limit to 100 requests/minute
});
app.use(limiter);

app.get('/', (_req,res) => {
    return res.redirect('/graphql');
})

app.post('/reset', async (req, res) => {
    try {
        const clearSessions = Boolean(req.body?.clearSessions);
        const message = await resetServerState(clearSessions);
        res.json({ ok: true, message });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
    }
});

app.use('/graphql', graphqlHTTP({
    schema: schema,
    graphiql: true
}))

app.listen(port, () => console.log("API started."));
