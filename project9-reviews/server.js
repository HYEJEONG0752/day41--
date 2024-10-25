// server.js

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const csrf = require('csurf');
const cookieParser = require('cookie-parser');
const path = require('path');
const morgan = require('morgan');

const User = require('./models/User');
const Review = require('./models/Review');

const app = express();

// 데이터베이스 연결
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB 연결 성공'))
.catch(err => console.error('MongoDB 연결 오류:', err));

// 미들웨어 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60
    }
}));

app.use(csrf({ cookie: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(morgan('combined'));

// 글로벌 변수 설정
app.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    res.locals.currentUser = req.session.user;
    next();
});

// 라우트 정의

// 홈 페이지 - 리뷰 목록 보기
app.get('/', async (req, res) => {
    try {
        const reviews = await Review.find().populate('user').sort({ createdAt: -1 });
        res.render('index', { reviews });
    } catch (err) {
        console.error(err);
        res.send('리뷰 목록을 불러오는 중 오류가 발생했습니다.');
    }
});

// 회원가입 페이지
app.get('/signup', (req, res) => {
    res.render('signup', { error: null });
});

// 회원가입 처리
app.post('/signup', async (req, res) => {
    const { username, email, password, confirmPassword } = req.body;

    if (!username || !email || !password || !confirmPassword) {
        return res.render('signup', { error: '모든 필드를 입력해주세요.' });
    }

    if (password !== confirmPassword) {
        return res.render('signup', { error: '비밀번호가 일치하지 않습니다.' });
    }

    try {
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
        return res.render('signup', { error: '이미 존재하는 사용자입니다.' });
        }

        const user = new User({ username, email, password });
        await user.save();

        req.session.user = { id: user._id, username: user.username, email: user.email };
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.render('signup', { error: '회원가입 중 오류가 발생했습니다.' });
    }
});

// 로그인 페이지
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// 로그인 처리
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.render('login', { error: '모든 필드를 입력해주세요.' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) {
        return res.render('login', { error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
        return res.render('login', { error: '이메일 또는 비밀번호가 올바르지 않습니다.' });
        }

        req.session.user = { id: user._id, username: user.username, email: user.email };
        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.render('login', { error: '로그인 중 오류가 발생했습니다.' });
    }
});

// 리뷰 작성 페이지 (로그인 필요)
app.get('/reviews/new', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.render('new', { error: null });
});

// 리뷰 작성 처리
app.post('/reviews/new', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const { rating, comment } = req.body;

    if (!rating || !comment) {
        return res.render('new', { error: '모든 필드를 입력해주세요.' });
    }

    if (rating < 1 || rating > 5) {
        return res.render('new', { error: '평점은 1에서 5 사이여야 합니다.' });
    }

    try {
        const review = new Review({
            user: req.session.user.id,
            rating,
            comment: comment.trim()
            });
            await review.save();
            res.redirect('/');
        } catch (err) {
            console.error(err);
            res.render('new', { error: '리뷰 작성 중 오류가 발생했습니다.' });
        }
});

// 리뷰 상세 페이지
app.get('/reviews/:id', async (req, res) => {
    const reviewId = req.params.id;

    try {
        const review = await Review.findById(reviewId).populate('user');
        if (!review) {
        return res.send('리뷰를 찾을 수 없습니다.');
        }
        res.render('detail', { review });
    } catch (err) {
        console.error(err);
        res.send('리뷰 상세 정보를 불러오는 중 오류가 발생했습니다.');
    }
});

// 로그아웃 처리
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
        return res.redirect('/');
        }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

// 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});