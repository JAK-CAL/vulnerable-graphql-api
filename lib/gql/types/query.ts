import {GraphQLObjectType, GraphQLString} from 'graphql';

import {GetAllUsers, GetUserById, Me} from './user'
import { GetPostById, SecureGetPostById, Search } from './post';
import { GetAllComments, GetCommentById } from './comment';
import { AdminUsers } from './user';

import axios from 'axios';

export const QueryType = new GraphQLObjectType({
    name: "RootQuery",
    fields: {
        // Return information about the currently-logged-in user.
        me: Me,

        // Get a list of all users, or find them by their ID.
        allUsers: GetAllUsers,
        user: GetUserById,

        // Find a post, or search. 
        post: GetPostById,
        securePost: SecureGetPostById,
        search: Search,

        // Additional object type for authorization testing.
        comment: GetCommentById,
        allComments: GetAllComments,

        // Admin-like query without role enforcement.
        adminUsers: AdminUsers,

        // Decoy operations make the schema less tiny without adding real security signal.
        health: {
            type: GraphQLString,
            resolve: async () => {
                return "ok";
            }
        },
        publicFeed: {
            type: GraphQLString,
            resolve: async () => {
                return "public feed placeholder";
            }
        },

        // Resolve an asset stored on the external service.
        getAsset: {
            type: GraphQLString,
            args: {
                name: {
                    type: GraphQLString
                }
            },
            resolve: async (_root, args, _context) => {
                let filename = args.name;
                let results = await axios.get(`http://localhost:8081/assets/${filename}`);
                return results.data;
            }
        }
    }
})
