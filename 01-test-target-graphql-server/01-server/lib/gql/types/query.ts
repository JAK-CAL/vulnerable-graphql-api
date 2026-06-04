import {GraphQLID, GraphQLInt, GraphQLList, GraphQLObjectType, GraphQLString} from 'graphql';

import {GetAllUsers, GetUserById, Me} from './user'
import { GetPostById, OwnerPostHistory, PostPreview, PublicPosts, SecureGetPostById, SecureSearch, Search } from './post';
import { CommentPreview, GetAllComments, GetCommentById, OwnerCommentHistory, PublicComments, SecureGetCommentById } from './comment';
import { AdminAuditStatus, AdminUsers, InternalStats, PrivateSystemReport } from './user';

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
        postPreview: PostPreview,
        ownerPostHistory: OwnerPostHistory,
        publicPosts: PublicPosts,
        search: Search,
        secureSearch: SecureSearch,

        // Additional object type for authorization testing.
        comment: GetCommentById,
        secureComment: SecureGetCommentById,
        commentPreview: CommentPreview,
        ownerCommentHistory: OwnerCommentHistory,
        allComments: GetAllComments,
        publicComments: PublicComments,

        // Admin-like queries: one intentionally vulnerable, one secure decoy.
        adminUsers: AdminUsers,
        internalStats: InternalStats,
        adminAuditStatus: AdminAuditStatus,
        privateSystemReport: PrivateSystemReport,

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
        serverTime: {
            type: GraphQLString,
            resolve: async () => {
                return new Date(0).toISOString();
            }
        },
        echo: {
            type: GraphQLString,
            args: {
                message: {
                    type: GraphQLString
                }
            },
            resolve: async (_root, args) => {
                return args.message || '';
            }
        },
        profileSummary: {
            type: GraphQLString,
            args: {
                id: {
                    type: GraphQLID
                }
            },
            resolve: async (_root, args) => {
                return 'profile summary ' + (args.id || 'current');
            }
        },
        userSettings: {
            type: GraphQLString,
            resolve: async () => {
                return 'theme=light;notifications=on';
            }
        },
        notificationCount: {
            type: GraphQLInt,
            resolve: async () => {
                return 0;
            }
        },
        tags: {
            type: new GraphQLList(GraphQLString),
            resolve: async () => {
                return ['course', 'graphql', 'testing'];
            }
        },
        categories: {
            type: new GraphQLList(GraphQLString),
            resolve: async () => {
                return ['public', 'private', 'archived'];
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
