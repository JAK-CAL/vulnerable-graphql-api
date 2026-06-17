import { GraphQLObjectType, GraphQLString, GraphQLBoolean, GraphQLID, GraphQLFieldConfig, GraphQLList } from 'graphql'
import { UserType } from './user';
import { db } from '../../../models';
import { CommentType } from './comment';

async function resolveAuthor(root: any) {
    let user = await root.getUser();
    return user;
}

function sanitizePost(post: any): any {
    if (!post) {
        return null;
    }
    let sanitized = post.toJSON ? post.toJSON() : Object.assign({}, post);
    sanitized.internalNote = null;
    return sanitized;
}

function canReadPost(post: any, context: any): boolean {
    if (!post) {
        return false;
    }
    let currentUserId = context && context.user ? String(context.user.id) : null;
    let ownerId = post.UserId !== undefined && post.UserId !== null ? String(post.UserId) : null;
    return (!!ownerId && currentUserId === ownerId) || (post.public === true && post.deleted !== true);
}

export var PostType: GraphQLObjectType = new GraphQLObjectType({
    name: 'Post',
    fields: () => ({
        id: {
            type: GraphQLID
        },
        title: {
            type: GraphQLString
        },
        content: {
            type: GraphQLString
        },
        public: {
            type: GraphQLBoolean
        },
        deleted: {
            type: GraphQLBoolean
        },
        internalNote: {
            type: GraphQLString
        },

        author: {
            type: UserType,
            resolve: resolveAuthor
        },
        comments: {
            type: new GraphQLList(CommentType),
            resolve: async (root: any) => {
                let comments = await root.getComments();
                return comments;
            }
        }
    })
});


export var GetPostById: GraphQLFieldConfig<any,any,any> = {
    type: PostType,
    args: {
        id: {
            type: GraphQLID
        }
    },
    resolve: async (_root, args, _info) => {
        let post = await db.Post.findByPk(args.id);
        return post;
    }
}

export var SecureGetPostById: GraphQLFieldConfig<any,any,any> = {
    type: PostType,
    args: {
        id: {
            type: GraphQLID
        }
    },
    resolve: async (_root, args, context) => {
        let post = await db.Post.findByPk(args.id);
        if (!canReadPost(post, context)) {
            return null;
        }

        return sanitizePost(post);
    }
}

export var PostPreview: GraphQLFieldConfig<any,any,any> = {
    type: PostType,
    args: {
        id: {
            type: GraphQLID
        }
    },
    resolve: async (_root, args, context) => {
        let post = await db.Post.findByPk(args.id);
        if (!canReadPost(post, context)) {
            return null;
        }

        return sanitizePost(post);
    }
}

export var OwnerPostHistory: GraphQLFieldConfig<any,any,any> = {
    type: PostType,
    args: {
        id: {
            type: GraphQLID
        }
    },
    resolve: async (_root, args, context) => {
        let post = await db.Post.findByPk(args.id);
        if (!post || !context.user || String(post.UserId) !== String(context.user.id)) {
            return null;
        }

        return sanitizePost(post);
    }
}

export var PublicPosts: GraphQLFieldConfig<any,any,any> = {
    type: new GraphQLList(PostType),
    resolve: async () => {
        let posts = await db.Post.findAll({where: {public: true, deleted: false}});
        return posts.map(sanitizePost);
    }
}

export var Search: GraphQLFieldConfig<any,any,any> = {
    type: new GraphQLList(PostType),
    args: {
        query: {
           type: GraphQLString 
        }
    },
    resolve: async (_root, args, _context) => {
        let arg = args.query;
        let query = `SELECT * FROM posts WHERE public=1 AND content LIKE '%${arg}%'`
        let posts = db.sequelize.query(query, {model: db.Post, mapToModel: true})
        return posts;
    }
}

export var SecureSearch: GraphQLFieldConfig<any,any,any> = {
    type: new GraphQLList(PostType),
    args: {
        query: {
           type: GraphQLString
        }
    },
    resolve: async (_root, args, _context) => {
        let posts = await db.Post.findAll({
            where: {
                public: true,
                deleted: false
            }
        });
        let needle = String(args.query || '').toLowerCase();
        return posts
            .filter((post: any) => String(post.content || '').toLowerCase().indexOf(needle) >= 0)
            .map(sanitizePost);
    }
}
