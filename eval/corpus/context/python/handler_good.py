from shell import run
def http_handler(request):
    run("date")
    return request.args["command"]
