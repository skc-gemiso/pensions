from datetime import date, timedelta
import calendar


def month_end(year: int, month: int) -> date:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, last_day)


def months_between(start: date, end: date) -> list[date]:
    """start ~ end 사이 각 월의 말일 목록 반환."""
    result = []
    y, m = start.year, start.month
    while date(y, m, 1) <= end:
        result.append(month_end(y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return result


def today() -> date:
    return date.today()
