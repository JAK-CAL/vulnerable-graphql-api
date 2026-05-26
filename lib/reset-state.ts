import argon2 from 'argon2';
import faker from 'faker';

import { db } from '../models';
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
        const hash = await argon2.hash(password);

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
            public: false
        }
    ];

    for (let i = 0; i < 250; i++) {
        const userId = userIds[getRandomInt(0, userIds.length)];

        posts.push({
            UserId: userId,
            title: faker.lorem.sentence(),
            content: faker.lorem.paragraphs(),
            public: getRandomInt(0, 5) !== 0
        });
    }

    return posts;
}

export async function resetServerState(clearSessions: boolean = false): Promise<string> {
    await db.sequelize.query('DELETE FROM Posts');
    await db.sequelize.query('DELETE FROM Users');
    await db.sequelize.query('DELETE FROM sqlite_sequence WHERE name IN ("Users", "Posts")');

    const users = await seedUsers();
    const userRows = await db.User.bulkCreate(users);
    const userIds = userRows.map((user: any) => user.id);

    await db.Post.bulkCreate(seedPosts(userIds));

    if (clearSessions) {
        await clearSessionStore();
    }

    resetUserState();

    return clearSessions
        ? 'Server state reset to seeded baseline and sessions cleared.'
        : 'Server state reset to seeded baseline.';
}
