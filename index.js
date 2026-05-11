const { WebcastPushConnection } = require('tiktok-live-connector');

const USERNAME = 'evelin_kids';
// const USERNAME = 'flo4you_ua';
// const USERNAME = '_skazhena_bilka_';

let tiktokLiveConnection = null;
let isConnected = false;

async function connectToLive() {

    if (isConnected) {
        return;
    }

    console.log('Проверяем LIVE...');

    tiktokLiveConnection = new WebcastPushConnection(USERNAME);

    try {

        const state = await tiktokLiveConnection.connect();

        isConnected = true;

        console.log(`✅ LIVE started! roomId=${state.roomId}`);

        // Чат
        tiktokLiveConnection.on('chat', data => {
            console.log(`[CHAT] ${data.uniqueId}: ${data.comment}`);

            if(data.comment.toLowerCase().includes('цена')) {
                console.log('Нужно ответить по цене');
            }

            if(data.comment.toLowerCase().includes('ціна')) {
                console.log('Нужно ответить по цене');
            }
        
            if(data.comment.toLowerCase().includes('цина')) {
                console.log('Нужно ответить по цене');
            }

            if(data.comment.startsWith('+')) {
                console.log('Новый заказ!');
            }

            if(data.comment.toLowerCase().includes('заберу')) {
                console.log('Новый заказ!');
            }
        });

        // Подписки
        tiktokLiveConnection.on('follow', data => {
            console.log(`[FOLLOW] ${data.uniqueId}`);
        });

        // Подарки
        tiktokLiveConnection.on('gift', data => {
            console.log(`[GIFT] ${data.uniqueId}`);
        });

        // Ошибки
        tiktokLiveConnection.on('error', err => {
            console.log('❌ Connection error:', err);
        });

        // Конец стрима
        tiktokLiveConnection.on('streamEnd', () => {

            console.log('🔴 LIVE ended');

            isConnected = false;

            reconnectLater();
        });

        // Иногда TikTok просто рвет соединение
        tiktokLiveConnection.on('disconnected', () => {

            console.log('⚠️ Disconnected');

            isConnected = false;

            reconnectLater();
        });

    } catch (err) {

        console.log('LIVE not found... waiting');

        reconnectLater();
    }
}

function reconnectLater() {

    setTimeout(() => {
        connectToLive();
    }, 10000); // каждые 10 сек
}

connectToLive();