import express, {NextFunction, Request, Response} from 'express';
import graphqlHTTP from 'express-graphql';
import session from 'express-session';
import cors from 'cors';

import {schema} from './lib/schema';
import {getUserById, resetState} from './lib/state';

const app = express();
const port = Number(process.env.PORT || 3100);

app.use(cors());
app.use(express.json());
app.use(session({
    secret: 'dvga-inspired-graphql-lab',
    resave: false,
    saveUninitialized: true
}));

function attachCurrentUser(req: Request, _res: Response, next: NextFunction): void {
    const sessionUserId = (req.session as any).userId;
    (req as any).user = sessionUserId ? getUserById(sessionUserId) : undefined;
    next();
}

app.use(attachCurrentUser);

app.get('/', (_req: Request, res: Response) => {
    res.redirect('/graphql');
});

app.post('/reset', (req: Request, res: Response) => {
    resetState();
    if (req.body && req.body.clearSessions && req.session) {
        req.session.destroy(() => undefined);
    }
    res.json({ok: true, message: '02 test target state reset'});
});

app.use('/graphql', graphqlHTTP((req: Request) => ({
    schema: schema,
    graphiql: true,
    context: {
        user: (req as any).user,
        session: req.session
    }
})));

app.listen(port, () => console.log('DVGA-inspired GraphQL lab started on port ' + port + '.'));
