const config = require('../config.json');
const schedule = require('node-schedule');

class ShantyManager {
    constructor(guild) {
        this.guild = guild;
        this.shantyVoiceChannel = undefined;
        this.shantyChannel = undefined;
        this.shantyJob = undefined;

        this._messageInterval = undefined;
        this._disconnectTimeout = undefined;
        this._connection = undefined;
    }

    // Schedule sea shanties
    startShantyJob(channel, voiceChannel) {
        this.shantyChannel = channel;
        this.shantyVoiceChannel = voiceChannel;
        this.shantyJob = schedule.scheduleJob(config.shanty.time, async () => {
            await this._performSeaShanties();
        })
    }

    // End shanties
    endShantyJob() {
        console.log(`Ending shanty on channel ${this.shantyVoiceChannel.name} in server ${this.shantyVoiceChannel.guild}`)
        this.shantyVoiceChannel.leave();

        this.shantyJob.cancel();
        this.shantyJob = undefined;

        if (this._messageInterval) clearInterval(this._messageInterval);
        if (this._disconnectTimeout) clearInterval(this._disconnectTimeout);

        this._messageInterval = undefined;
        this._disconnectTimeout = undefined;
        this._connection = undefined;
    }

    // Join channel and perform actions
    async _performSeaShanties() {
        console.log(`Starting shanty on channel ${this.shantyVoiceChannel.name} in server ${this.shantyVoiceChannel.guild}`);

        // Join voice channel
        this._connection = await this.shantyVoiceChannel.join();

        // Set interval for sending messages
        this._messageInterval = setInterval(() => {
            if (this.shantyChannel === undefined) return;

            this.shantyChannel.send(config.shanty.messages[Math.floor(Math.random() * config.shanty.messages.length)]);
        }, config.shanty.messageInterval * 60 * 1000);

        // Set interval for leaving voice channel
        this._disconnectTimeout = setTimeout(() => {
            this._disconnectTimeout = undefined;
            this.endShantyJob();
        }, config.shanty.sessionDuration * 60 * 1000);

        // Ask for sea shanties
        if (this.shantyChannel === undefined) return;
        await new Promise(resolve => setTimeout(resolve, 3000)); // wait 3 seconds
        this.shantyChannel.send(`!play ${config.shanty.songs[Math.floor(Math.random() * config.shanty.songs.length)]}`);
    }
}

module.exports = ShantyManager;