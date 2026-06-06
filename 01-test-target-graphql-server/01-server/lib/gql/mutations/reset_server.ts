import { GraphQLBoolean, GraphQLString } from 'graphql';

import { resetServerState } from '../../reset-state';

export const ResetServer = {
    type: GraphQLString,
    args: {
        confirm: {
            type: GraphQLBoolean
        },
        clearSessions: {
            type: GraphQLBoolean,
            defaultValue: false
        }
    },
    resolve: async (_root: any, args: any) => {
        if (!args.confirm) {
            throw new Error('Set confirm to true to reset the server state.');
        }

        return await resetServerState(Boolean(args.clearSessions));
    }
};
