require('dotenv').config();

const Discord = require('discord.js');
const admin = require('./firebaseAdmin');
const moment = require('moment');
const fetch = require('node-fetch');
const config = require('./config.json');
const ShantyManager = require('./models/ShantyManager');

const bucket = admin.storage().bucket();
const db = admin.firestore();

let settings = {
    channels: [],
    shantyManagers: [], // One per server
}

// Initialize Discord Bot
const bot = new Discord.Client({
    token: process.env.BOT_TOKEN,
});

// Upload image from url to GCS and Firestore
async function upload(image, message) {
    // Create document & upload
    const name = `${moment(Date.now()).format('MM-DD-YY:hh.mm.ss')}-${image.name}`;
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${name}?alt=media`;
    const timeStamp = admin.firestore.Timestamp.fromDate(new Date(message.createdTimestamp));
    const customMetadata = {
        timeStamp,
        author: message.author.username,
        server: message.guild.name,
        serverId: message.guild.id,
    }

    const doc = Object.assign({ url: publicUrl }, customMetadata);
    db.collection('images').doc(name).set(doc)
        .catch(err => console.log(err));

    // Create storage file
    console.log(`Creating file ${name}...`)
    const splitName = image.name.split('.');
    const file = bucket.file(name);
    const metadata = {
        contentType: `image/${splitName[splitName.length - 1]}`,
        metadata: customMetadata,
    };

    // Upload image
    console.log(`Writing image to file ${name}...`)
    const writeStream = file.createWriteStream({ metadata });
    const res = await fetch(image.url)
    const end = new Promise((resolve, reject) => {
        res.body.pipe(writeStream)
            .on('err', (err) => {
                console.log(err)
                reject(err);
            })
            .on('finish', () => {
                console.log(`Publishing image ${name}...`)
                file.makePublic()
                    .then(() => {
                        console.log(`Completed uploading image ${name}`);
                        resolve();
                    })
            });
    });

    return await end;
}

function getImagesFromMessage(message) {
    if (message.attachments === undefined && message.embeds === undefined) return [];

    let images = [];
    function checkURL(url) {
        const imageExtensions = ['png', 'jpg', 'jpeg'];

        // If attachment is a supported image, add to images
        if (imageExtensions.map(e => url.indexOf(e, url.length - e.length) !== -1)) {
            return true;
        }
    }

    message.attachments.forEach((attachment) => {
        if (checkURL(attachment.url)) images.push(attachment)
    });

    message.embeds.forEach((embed) => {
        if (embed.type === 'image' && checkURL(embed.url)) images.push(Object.assign(
            { name: embed.url.split('/').slice(-1)[0] },
            embed,
        ));
    })

    return images;
}

// On ready
bot.on('ready', () => {
    console.log(`Connected`)
});

bot.on('message', (message) => {
    // If server not already registered, create shanty manager
    if (!settings.shantyManagers.hasOwnProperty(message.guild.id)) {
        settings.shantyManagers[message.guild.id] = new ShantyManager(message.guild.id);
    }

    if(message.author.bot || message.system) return; // Ignore bots

    const channelID = message.channel.id;

    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `!`
    if (message.content.substring(0, 1) === '!') {
        let args = message.content.substring(1).split(' ');
        const cmd = args[0];

        args = args.splice(1);
        switch(cmd) {
            case 'channel': // Commands to configure channel settings
                switch (args[0]) {
                    case 'upload':
                        settings.channels.push(channelID);
                        message.channel.send('Images sent in this channel will now be uploaded to dmarchel.com');
                        break;

                    case 'block':
                        settings.channels = settings.channels.filter(id => id !== channelID);
                        message.channel.send('Images sent in this channel will no longer be uploaded to dmarchel.com');
                        break;

                    case 'status':
                        const botMessage = settings.channels.includes(channelID) ?
                            'Images sent in this channel will be uploaded to dmarchel.com'
                            : 'Images sent in this channel will not be uploaded to dmarchel.com'
                        message.channel.send(botMessage);
                        break;

                    case 'shanty': // secret
                        let shantyManager = settings.shantyManagers[message.guild.id];
                        if (shantyManager.shantyJob === undefined) {
                            // Start shanty
                            shantyManager.startShantyJob(message.channel, message.member.voice.channel);
                        } else {
                            // End shanty
                            shantyManager.endShantyJob();

                            message.channel.send(config.shanty.messages[Math.floor(Math.random() * config.shanty.messages.length)])
                        }
                        break;
                }
                break;

            case 'upload': // Upload all images in channel retroactively
                message.channel.send('All images in the last 100 messages sent to this channel will now be uploaded to dmarchel.com');

                message.channel.messages.fetch({ limit: 100 }).then(async (messageCollection) => {
                    const messages = messageCollection.map(m => m);
                    for (const m of messages) {
                        const images = getImagesFromMessage(m);
                        for (const image of images) {
                            await upload(image, m);
                        }
                    }
                });
                break;

            case 'help':
                const botMessage = `
                JudeParkhillBot
                \`\`\`-- channel\`\`\`
                    Channel specific operations
                    
                    \`\`\`upload\`\`\`
                        Give the bot permission to upload images sent in this channel to dmarchel.com
                        
                    \`\`\`block\`\`\`
                        Remove the bot's permission to upload images sent in this channel to dmarchel.com
                    
                    \`\`\`status\`\`\`
                        Check whether or not the bot has permission to upload images sent in this channel to dmarchel.com
                
                \`\`\`-- upload\`\`\`
                    Upload all previous images sent in this channel to dmarchel.com
                `;
                message.channel.send(botMessage);
        }
    }

    if (settings.channels.includes(channelID)) {
        const images = getImagesFromMessage(message) || [];
        images.forEach(image => upload(image, message));
    }
});

bot.login(process.env.BOT_TOKEN);