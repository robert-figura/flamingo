import operator

AND = operator.and_
NOT = operator.not_
OR = operator.or_


def _str(s):
    return str(s) if s is not None else ''


LOGIC_FUNCTIONS = {
    'eq': lambda a, b: a == b,
    'ne': lambda a, b: a != b,
    'lt': lambda a, b: a < b,
    'lte': lambda a, b: a <= b,
    'gt': lambda a, b: a > b,
    'gte': lambda a, b: a >= b,
    'in': lambda a, b: a in b,
    'contains': lambda a, b: _str(b) in _str(a),
    'icontains': lambda a, b: _str(b).lower() in _str(a).lower(),
    'isnull': lambda a, b: a is None if b else a is not None,
    'isfalse': lambda a, b: not bool(a) if b else bool(a),
    'startswith': lambda a, b: _str(a).startswith(b),
    'endswith': lambda a, b: _str(a).startswith(b),
    'passes': lambda a, b: b(a),
}


class F:
    def __init__(self, name):
        self.name = name

    def __repr__(self):
        return "F('{}')".format(self.name)


class Q:
    def __init__(self, *qs, **lookups):
        self.connector = 'AND'
        self.negated = False
        self.qs = None
        self.lookups = None

        if not qs and not lookups:
            raise TypeError('to few arguments')

        if qs and lookups:
            raise TypeError('to many arguments')

        if qs:
            self.qs = qs

        if lookups:
            self.lookups = lookups

    def __repr__(self):
        if self.qs:
            repr_str = ', '.join([
                repr(q) for q in self.qs
            ])

        elif self.lookups:
            repr_str = ', '.join([
                '{}={}'.format(k, repr(v)) for k, v in self.lookups.items()
            ])

        return '<{}{}({})>'.format(
            'NOT ' if self.negated else '',
            self.connector,
            repr_str,
        )

    def __or__(self, other):
        q = Q(self, other)
        q.connector = 'OR'

        return q

    def __and__(self, other):
        return Q(self, other)

    def __invert__(self):
        self.negated = not self.negated

        return self

    def check(self, obj):
        results = []
        end_result = None

        if self.qs:
            for q in self.qs:
                results.append(q.check(obj))

        elif self.lookups:
            for field_name, value in self.lookups.items():
                logic_function = 'eq'

                if '__' in field_name:
                    field_name, logic_function = field_name.split('__')

                if isinstance(value, F):
                    value = obj[value.name]

                try:
                    results.append(
                        LOGIC_FUNCTIONS[logic_function](
                            obj[field_name], value))

                except TypeError:
                    results.append(False)

        if self.connector == 'AND':
            end_result = all(results)

        elif self.connector == 'OR':
            end_result = any(results)

        else:
            raise ValueError("unknown connector '{}'".format(self.connector))

        if self.negated:
            end_result = not end_result

        return end_result


class Content:
    def __init__(self, **data):
        self.data = data

    def __repr__(self):
        return '<Content({})>'.format(
            ', '.join(
                ['{}={}'.format(k, repr(v)) for k, v in self.data.items()
                 if k != 'content']
            )
        )

    def __str__(self):
        content = self['content']

        if not content:
            return ''

        return str(content)

    def __getitem__(self, key):
        if key in self.data:
            return self.data[key]

        return None

    def __setitem__(self, key, item):
        return self.data.__setitem__(key, item)


class ContentSet:
    def __init__(self, contents=None):
        self.contents = contents or []

    def add(self, *contents, **data):
        if contents:
            self.contents.extend(contents)

        if data:
            self.add(Content(**data))

    def filter(self, *args, **kwargs):
        q = Q(*args, **kwargs)
        content_set = self.__class__()

        for content in self.contents:
            if q.check(content):
                content_set.add(content)

        return content_set

    def exclude(self, *args, **kwargs):
        q = Q(*args, **kwargs)
        content_set = self.__class__()

        for content in self.contents:
            if not q.check(content):
                content_set.add(content)

        return content_set

    def get(self, *args, **kwargs):
        if args or kwargs:
            contents = self.filter(*args, **kwargs)

        else:
            contents = self.contents

        if len(contents) > 1:
            raise ValueError('Ambiguous query')

        if len(contents) < 1:
            return None

        return contents[0]

    def values(self, *field_names):
        return_values = []

        for content in self:
            return_values.append(tuple())

            for field_name in field_names:
                return_values[-1] += (content[field_name], )

            if len(field_names) == 1:
                if return_values[-1][0] is None:
                    return_values.pop()

                else:
                    return_values[-1] = return_values[-1][0]

        if len(field_names) == 1:
            dirty_return_values = return_values
            return_values = []

            for i in dirty_return_values:
                if i not in return_values:
                    return_values.append(i)

        return return_values

    def order_by(self, field_name):
        reverse = False

        if field_name.startswith('-'):
            field_name = field_name[1:]
            reverse = True

        return self.__class__(
            contents=sorted(
                self.contents,
                key=lambda x: (x[field_name] is None, x[field_name]),
                reverse=reverse,
            )
        )

    def count(self):
        return len(self.contents)

    def __len__(self):
        return self.contents.__len__()

    def __getitem__(self, key):
        contents = self.contents.__getitem__(key)

        if isinstance(key, slice):
            contents = self.__class__(contents=contents)

        return contents

    def __iter__(self):
        return self.contents.__iter__()

    def __repr__(self):
        return '<ContentSet({})>'.format(repr(self.contents)[1:-1])
