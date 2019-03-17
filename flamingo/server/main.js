function iframe_onload(iframe) {
    // url
    ractive.set('iframe_pathname', iframe.contentWindow.location.pathname);
    document.location.hash = iframe.contentWindow.location.pathname;

    // title
    document.title = iframe.contentDocument.title;

    // favicon
    var nodes = iframe.contentDocument.getElementsByTagName('link');

    for(var index = 0; index < nodes.length; index++) {
        if((nodes[index].getAttribute('rel') == 'icon') || (nodes[index].getAttribute('rel') == 'shortcut icon')) {
            document.querySelector("link[rel='shortcut icon']").href = nodes[index].getAttribute('href');
        }
    }

    // page offset
    if(ractive.get('iframe_set_offset')) {
        var offset = ractive.get('iframe_offset');

        iframe.contentWindow.scrollTo(offset[0], offset[1]);
        ractive.set('iframe_set_offset', false);

    } else {
        ractive.set('iframe_offset', [0, 0]);

    }

    iframe.contentWindow.onscroll = function(event) {
        ractive.set('iframe_offset', [this.scrollX, this.scrollY]);
    }
}

function iframe_set_url(url) {
    var iframe = document.getElementsByTagName('iframe')[0];

    ractive.set('iframe_set_offset', false);

    if(url == '') {
        ractive.set('iframe_pathname', '/');

    } else {
        iframe.contentWindow.location = url;

    }
}

function get_hash() {
    var hash = document.location.hash;

    if(!hash) {
        return '/';

    }

    return hash.substring(1);
}

function onhashchange() {
    var hash = get_hash();

    if(hash != ractive.get('iframe_pathname')) {
        iframe_set_url(hash);
    }
}

function iframe_reload() {
    var iframe = document.getElementsByTagName('iframe')[0];

    ractive.set('iframe_set_offset', true);
    iframe.contentWindow.location.reload(true);
}

function hide_message(id) {
    var messages = ractive.get('messages');

    for(var index in messages) {
        if(messages[index].id == id) {
            messages.splice(index, 1);
            ractive.set('messages', messages);

            return;
        }
    }
}

function show_message(message, timeout) {
    var messages = ractive.get('messages');

    for(var index in messages) {
        if(messages[index].message == message) {
            return;
        }
    }

    var id = message_id;
    message_id = id + 1;

    messages.push({
        id: id,
        message: message,
    });

    ractive.set('messages', messages);

    if(timeout != undefined) {
        setTimeout(function() {
            hide_message(id);
        }, timeout);

    }

    return id;
}

var rpc = new RPC('ws://' + window.location.host + '/live-server/rpc/');
var message_id = 1;

var ractive = Ractive({
    target: '#ractive',
    template: '#main',
    data: {
        iframe_pathname: get_hash(),
        iframe_initial_pathname: get_hash(),
        iframe_set_offset: false,
        iframe_offset: [0, 0],
        overlay: -1,
        overlay_reason: '',
        overlay_heading: '',
        overlay_content: '',
        log: [],
        messages: [],
    }
});

ractive.on({
    toggle_overlay: function(event) {
        if(rpc._ws.readyState == rpc._ws.OPEN) {
            ractive.set({
                overlay: ractive.get('overlay') * -1,
                overlay_reason: 'user',
            });
        }
    },
    reload: function(event) {
        iframe_reload();
    },
    rebuild: function(event) {
        ractive.set('overlay_content', 'rebuilding full site...');

        rpc.call('rebuild', undefined, function(data) {
            ractive.set('overlay_content', 'site rebuild successful');

        },
        function(data) {
            ractive.set('overlay_content', 'rebuild failed');

        });
    },
    toggle_index: function(event) {
        rpc.call('toggle_index', undefined, function(data) {
            ractive.set('overlay_content', 'index is ' + (data ? 'enabled':'disabled'));
            iframe_reload();

        },
        function(data) {
            ractive.set('overlay_content', 'internal error');

        });
    },
    hide_message: function(event, id) {
        hide_message(id);
    },
});

rpc.on('open', function(rpc) {
    ractive.set({
        overlay_heading: 'Connected',
        overlay_content: '',
    });

    if(ractive.get('overlay') > 0 && ractive.get('overlay_reason') == 'reconnect') {
        ractive.set({
            overlay: -1,
            overlay_reason: '',
        });
    }

    rpc.subscribe('status', function(data) {
        var iframe = document.getElementsByTagName('iframe')[0];

        if(data.changed_paths.includes(iframe.contentWindow.location.pathname) ||
           data.changed_paths.includes('*')) {

            iframe_reload();
            ractive.set('log', []);

            if(ractive.get('overlay_reason') == 'log') {
                ractive.set('overlay', -1);
            }
        }
    });

    rpc.subscribe('log', function(data) {
        var log = ractive.get('log').concat(data);

        log = log.slice(-100);
        ractive.set('log', log);

        for(var index in ractive.get('log')) {
            if(log[index].level == 'ERROR' && ractive.get('overlay') < 0) {
                ractive.set({
                    overlay: 1,
                    overlay_reason: 'log',
                });
            }
        }
    });

    rpc.subscribe('messages', function(data) {
        show_message(data, 2000);
    });

    iframe_reload();
});

function reconnect() {
    var counter = 5;

    function tick() {
        if(counter > -1) {
            ractive.set('overlay_content', 'trying to reconnect in ' + counter + ' seconds');
            counter--;

            setTimeout(function() {
                tick();
            }, 1000);

        } else {
            rpc.connect();

        }
    }

    tick();
}

rpc.on('close', function(rpc) {
    ractive.set({
        overlay_heading: 'Connection lost',
        log: [],
    });

    if(ractive.get('overlay') < 0) {
        ractive.set({
            overlay: 1,
            overlay_reason: 'reconnect',
        });
    }

    reconnect();
});

rpc.connect();
