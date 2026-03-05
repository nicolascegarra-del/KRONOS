from app.services.geofence import haversine_meters, is_within_any_work_center


class FakeWC:
    def __init__(self, lat, lng, radius_meters):
        self.lat = lat
        self.lng = lng
        self.radius_meters = radius_meters


def test_haversine_same_point():
    assert haversine_meters(40.0, -3.0, 40.0, -3.0) == 0.0


def test_haversine_known_distance():
    # Madrid to Barcelona ~504 km
    d = haversine_meters(40.4168, -3.7038, 41.3851, 2.1734)
    assert 500_000 < d < 510_000


def test_is_within_range():
    wc = FakeWC(lat=40.4168, lng=-3.7038, radius_meters=500)
    # Point ~50m away
    assert is_within_any_work_center(40.4170, -3.7040, [wc]) is True


def test_is_out_of_range():
    wc = FakeWC(lat=40.4168, lng=-3.7038, radius_meters=200)
    # Barcelona is ~500 km away
    assert is_within_any_work_center(41.3851, 2.1734, [wc]) is False


def test_within_any_of_multiple():
    wc1 = FakeWC(lat=40.4168, lng=-3.7038, radius_meters=200)  # Madrid
    wc2 = FakeWC(lat=41.3851, lng=2.1734, radius_meters=500)   # Barcelona
    # Point near Barcelona — within wc2
    assert is_within_any_work_center(41.3855, 2.1730, [wc1, wc2]) is True


def test_empty_work_centers():
    assert is_within_any_work_center(40.0, -3.0, []) is False
