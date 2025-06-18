#
# cosmic-watch-measurement
#
#  using for data acquisition from Cosmic Watch 
#  generate exe file: pyinstaller .\cosmic-watch-measurement.spec --onefile
#

import serial
import serial.tools.list_ports
import datetime
from time import sleep
from msvcrt import getch
import os
#search avilable COM ports
def search_com_port():
    coms = serial.tools.list_ports.comports()
    comlist = []
    for com in coms:
        comlist.append(com.device)
    print('Connected COM ports: ' + str(comlist))
    return comlist

#select COM port
def select_com_port(comlist):
    if len(comlist) == 1:
        print('connected to '+comlist[0])
        return comlist[0]
    elif len(comlist) > 1:
        print('select from available ports:')
        i = 0
        for com in comlist:
            print(str(i) + ': ' + com)
            i += 1
        use_port_num = input()
        print('connected to '+comlist[int(use_port_num)])
        return comlist[int(use_port_num)]
    else:
        print("detector is not detected.")
        time.sleep(10)

#ready serial com.
comlist = search_com_port()        # Search COM Ports
use_port = select_com_port(comlist)
ser = serial.Serial(use_port,9600)    # Init Serial Port Setting


# prepare plotting
data ={
    'time':[],
    'adc':[],
    'vol':[],
    'deadtime':[]
}

#time start
start_time = datetime.datetime.now()

#prepare data directory 
try:
    os.makedirs('./data/')
except FileExistsError:
    pass

#read lines
try:
    while True: #loop until ctrl+C
        day = datetime.datetime.now()
        f = open('./data/' + day.strftime('%Y-%m-%d')+'.dat', 'a')
        try:
            line = ser.readline().decode('utf-8').split() #read lines
        except UnicodeDecodeError:
            continue
        if (len(line) > 2 and line[0] != '###'):
            line.insert(1, day.strftime('%Y-%m-%d-%H-%M-%S.%f'))
            print(line)    #read lines
            f.write('\t'.join(line)+'\n')   #write lines
            f.close()
except KeyboardInterrupt:   #terminate with ctrl+C
    exit
