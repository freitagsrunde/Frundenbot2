import TelegramBot from 'node-telegram-bot-api';


if (typeof process.env.auth_token !== "string") {
    console.log("auth_token is not set")
    process.exit(-1);
}

const token = process.env.auth_token;
const checkInterval = 30;

const OPEN_MESSAGE = "✅ Die Freitagsrunde ist offen!";
const CLOSED_MESSAGE = "🔴 Leider haben wir gerade zu.";
const NOTIFY_OPEN_MESSAGE = "Wir benachrichtigen dich, sobald die Freitagsrunde wieder geöffnet hat.";
const NOTIFY_CLOSED_MESSAGE = "Wir benachrichtigen dich, sobald die Freitagsrunde wieder geschlossen hat.";
const HELP_MASSAGE = `/open
    Ist die Freitgasrunde gerade offen?
/notify
    Benachrichtige mich, wenn die Freitagsrunde öffnet.
/notify_closed
    Benachrichtige mich, wenn die Freigtagsrunde schließt.`;


class IsOpenManager {
    constructor() {
        this._subscribers = new Set();
    }
    async isOpen() {
        if (typeof this._lastOpenCheck !== "undefined") {
            if (new Date() - this._lastOpenCheck <= checkInterval) {
                return this._isOpen;
            }
        }

        const prevState = this._isOpen;
        const status = await (await fetch("https://watchyour.freitagsrunde.org/status")).text();
        this._lastOpenCheck = new Date();

        if (status === "OPEN\n") {
            this._isOpen = true;
        } else if (status === "CLOSED\n") {
            this._isOpen = false;
        } else {
            throw Error(`Unkown status: ${status}`);
        }

        if(this._isOpen != prevState){
            this._handeSubscribers();
        }
        return this._isOpen
    }

    addSubscriber(subscriber) {
        const wasEmpty = this._subscribers.size === 0;
        this._subscribers.add(subscriber);

        if (wasEmpty) {
            this._checker = setInterval(this.isOpen.bind(this), checkInterval);
        }
    }

    removeSubscriber(subscriber) {
        this._subscribers.delete(subscriber);

        if (this._subscribers.size === 0) {
            clearInterval(this._checker);
        }
    }

    _handeSubscribers() {
        const copy = new Set(this._subscribers);
        for (const subscriber of copy) {
            subscriber(subscriber, this._isOpen);
        }
    }
}

const manager = new IsOpenManager();

manager.isOpen().then((_) => {
    const bot = new TelegramBot(token, { polling: true });
    console.log("[+] Bot started")

    bot.onText(/^\/open$/, async (msg) => {
        const chatId = msg.chat.id;
        const isOpen = await manager.isOpen();
        const resp = isOpen ? OPEN_MESSAGE : CLOSED_MESSAGE;
        bot.sendMessage(chatId, resp);
    });

    bot.onText(/^\/notify$/, async (msg) => {
        const chatId = msg.chat.id;
        if(await manager.isOpen()){
            bot.sendMessage(chatId, OPEN_MESSAGE + "\nFalls du benachrichtigt werden willst, wenn wir wieder zu machen, verwende /notify_clsoed.");
        } else {
            bot.sendMessage(chatId, NOTIFY_OPEN_MESSAGE);
            manager.addSubscriber((self, isOpen) => {
                if(!isOpen){
                    console.log("Notify on open called while closed.");
                }
                manager.removeSubscriber(self);
                bot.sendMessage(chatId, "✅ Die Freitagsrunde ist nun offen!");
            })
        }
    });

    bot.onText(/^\/notify_closed$/, async (msg) => {
        const chatId = msg.chat.id;
        if(!await manager.isOpen()){
            bot.sendMessage(chatId, CLOSED_MESSAGE + "\nFalls du benachrichtigt werden willst, wenn wir wieder zu öffnen, verwende /notify.");
        } else {
            bot.sendMessage(chatId, NOTIFY_CLOSED_MESSAGE);
            manager.addSubscriber((self, isOpen) => {
                if(isOpen){
                    console.log("Notify on closed called while open.");
                }
                manager.removeSubscriber(self);
                bot.sendMessage(chatId, "🔴 Die Freigtagsrunde hat nun zu.");
            });
        }
    });

    bot.on('message', (msg) => {
        const chatId = msg.chat.id;
        const commands = ["/open", "/notify", "/notify_closed"];
        if(commands.includes(msg.text)){
            return;
        }
        bot.sendMessage(chatId, HELP_MASSAGE);
    });
});

