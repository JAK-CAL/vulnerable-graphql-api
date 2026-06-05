import faker from 'faker';

import { db } from '../models';
import { hashPassword } from './password';
import { clearSessionStore, resetUserState } from './server-state';

function getRandomInt(min: number, max: number) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
}

async function seedUsers() {
    faker.seed(0xDEADBEEF);

    const users = [];

    for (let i = 0; i < 50; i++) {
        const token = faker.random.number({ min: 0, max: 99999 });
        const password = faker.internet.password();
        const hash = hashPassword(password);

        users.push({
            id: i + 1,
            username: faker.internet.userName(),
            firstName: faker.name.firstName(),
            lastName: faker.name.lastName(),
            password: hash.toString(),
            resetToken: token.toString().padStart(5, '0')
        });
    }

    return users;
}

function seedPosts(userIds: number[]) {
    faker.seed(0xC0FFEE);

    const posts = [
        {
            UserId: userIds[0],
            title: 'Secret private post',
            content: 'This is a private post. Go away.',
            public: false,
            deleted: false,
            internalNote: 'owner-only internal note'
        }
    ];

    for (let i = 0; i < 250; i++) {
        const userId = userIds[getRandomInt(0, userIds.length)];

        posts.push({
            UserId: userId,
            title: faker.lorem.sentence(),
            content: faker.lorem.paragraphs(),
            public: getRandomInt(0, 5) !== 0,
            deleted: false,
            internalNote: faker.lorem.words()
        });
    }

    return posts;
}

function seedComments(userIds: number[], postIds: number[]) {
    faker.seed(0xFACE);

    const comments = [];

    for (let i = 0; i < 120; i++) {
        comments.push({
            UserId: userIds[getRandomInt(0, userIds.length)],
            PostId: postIds[getRandomInt(0, postIds.length)],
            body: faker.lorem.sentence(),
            public: getRandomInt(0, 4) !== 0,
            deleted: false,
            moderationNote: faker.lorem.words()
        });
    }

    return comments;
}

export async function resetServerState(clearSessions: boolean = false): Promise<string> {
    await db.sequelize.query('DELETE FROM Comments');
    await db.sequelize.query('DELETE FROM Posts');
    await db.sequelize.query('DELETE FROM Users');
    await db.sequelize.query('DELETE FROM sqlite_sequence WHERE name IN ("Users", "Posts", "Comments")');

    const users = await seedUsers();
    const userRows = await db.User.bulkCreate(users);
    const userIds = userRows.map((user: any) => user.id);

    const postRows = await db.Post.bulkCreate(seedPosts(userIds));
    const postIds = postRows.map((post: any) => post.id);
    await db.Comment.bulkCreate(seedComments(userIds, postIds));

    if (clearSessions) {
        await clearSessionStore();
    }

    resetUserState();

    return clearSessions
        ? 'Server state reset to seeded baseline and sessions cleared.'
        : 'Server state reset to seeded baseline.';
}
