const rootPath = '/app';
const route = decodeURIComponent(location.pathname.replace(/^\/app\/?/, '')).replace(/\/$/, '');
location.replace(`${rootPath}${location.search}#/${route}`);
