const config = require('../config.json');
const schedule = require('node-schedule');
const path = require('path');

class ShantyManager {
    guild;

    shantyVoiceChannel;
    shantyChannel;
    shantyJob;

    _messageInterval;
    _audioTimeout;
    _disconnectTimeout;
    _connection;

    _audioLoopFlag;

    constructor(guild) {
        this.guild = guild;
        this.shantyVoiceChannel = undefined;
        this.shantyChannel = undefined;
        this.shantyJob = undefined;

        this._messageInterval = undefined;
        this._audioTimeout = undefined;
        this._disconnectTimeout = undefined;
        this._connection = undefined;

        this._audioLoopFlag = false;
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
        if (this._audioTimeout) clearTimeout(this._audioTimeout);
        if (this._disconnectTimeout) clearTimeout(this._disconnectTimeout);

        this._messageInterval = undefined;
        this._audioLoopFlag = false;
        this._disconnectTimeout = undefined;
        this._connection = undefined;
    }

    // Join channel and perform actions
    async _performSeaShanties() {
        if (!this.shantyVoiceChannel) return;
        console.log(`Starting shanty on channel ${this.shantyVoiceChannel.name} in server ${this.shantyVoiceChannel.guild}`);

        // Join voice channel
        this._connection = await this.shantyVoiceChannel.join();
        if (!this._connection) return;

        // Set interval for sending messages
        this._messageInterval = setInterval(() => {
            if (this.shantyChannel === undefined) return;

            this.shantyChannel.send(config.shanty.messages[Math.floor(Math.random() * config.shanty.messages.length)]);
        }, config.shanty.messageInterval * 60 * 1000);

        // Set audio loop flag for speaking in channel
        this._audioLoopFlag = true;
        const playVoice = () => {
            if (
                !this._connection
                || this.shantyVoiceChannel === undefined
                || !this._audioLoopFlag
            ) return;

            const audioFile = path.resolve(
                `../resources/audio/JudeVoice_${Math.ceil(
                    Math.random() * 25)
                    .toLocaleString(undefined, { minimumIntegerDigits: 2 })
                }.wav`
            );

            console.log(`Playing audio ${audioFile}`)

            const dispatcher = this._connection.play(audioFile, { volume: 1 });
            console.log(dispatcher.paused);

            dispatcher.on('end', (end) => {
                const timeout = (
                    config.shanty.voiceInterval
                    + Math.random() * config.shanty.voiceIntervalVariation
                    - 0.5 * config.shanty.voiceIntervalVariation
                );

                console.log(`Finished playing, resting for ${timeout} minutes`)
                if (this._audioLoopFlag) {
                    this._audioTimeout = setTimeout(
                        playVoice,
                        timeout * 60 * 1000
                    );
                }
            });
        }
        playVoice();

        // Set timeout for leaving voice channel
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