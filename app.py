from flask import Flask, render_template, request, jsonify
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime
import os

app = Flask(__name__)

# Configurar Firebase de forma segura
import json

# Primero intentamos leer la llave desde una variable de entorno (Ideal para Render)
service_account_info = os.environ.get('FIREBASE_SERVICE_ACCOUNT')

last_init_error = None

try:
    if service_account_info:
        # Limpiar posibles espacios o comillas si se pegó mal en Render
        service_account_info = service_account_info.strip()
        cred_dict = json.loads(service_account_info)
        cred = credentials.Certificate(cred_dict)
    else:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        cred_path = os.path.join(current_dir, 'serviceAccountKey.json')
        cred = credentials.Certificate(cred_path)

    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Conexión a Firestore exitosa.")
except Exception as e:
    last_init_error = str(e)
    print(f"Error conectando a Firebase: {last_init_error}")
    db = None

# Rutas del Servidor Flask

@app.route('/')
def index():
    # Servimos el archivo HTML principal
    return render_template('index.html')

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    """Obtiene las transacciones desde Firestore, filtradas por usuario."""
    if not db:
        return jsonify({"error": "No database connection", "details": last_init_error}), 500
        
    user_id = request.args.get('userId')
    if not user_id:
        return jsonify({"error": "Unauthorized. UserId required."}), 401

    try:
        # Consultar solo los documentos que pertenecen a este usuario
        transactions_ref = db.collection('transactions')
        query = transactions_ref.where('userId', '==', user_id).order_by('date', direction=firestore.Query.DESCENDING)
        docs = query.stream()
        
        transactions = []
        for doc in docs:
            item = doc.to_dict()
            item['id'] = doc.id
            # Manejar el tipo de dato Timestamp de Firestore a string para JSON
            if 'timestamp' in item and hasattr(item['timestamp'], 'isoformat'):
                 item['timestamp'] = item['timestamp'].isoformat()
            transactions.append(item)
            
        return jsonify(transactions), 200
        
    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500

@app.route('/api/transactions', methods=['POST'])
def add_transaction():
    """Agrega una nueva transacción a Firestore validando el usuario."""
    if not db:
        return jsonify({"error": "No database connection"}), 500
        
    data = request.json
    user_id = data.get('userId')
    
    if not user_id:
        return jsonify({"error": "Unauthorized. UserId required."}), 401

    try:
        new_transaction = {
            'userId': user_id,
            'type': data.get('type'),
            'amount': float(data.get('amount', 0)),
            'description': data.get('description'),
            'category': data.get('category'),
            'date': data.get('date'),
            'timestamp': firestore.SERVER_TIMESTAMP
        }
        
        db.collection('transactions').add(new_transaction)
        return jsonify({"message": "Transacción agregada exitosamente"}), 201
        
    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500

@app.route('/api/transactions/<transaction_id>', methods=['DELETE'])
def delete_transaction(transaction_id):
    """Elimina una transacción específica por ID validando el usuario."""
    if not db:
        return jsonify({"error": "No database connection"}), 500
        
    user_id = request.args.get('userId')
    if not user_id:
        return jsonify({"error": "Unauthorized. UserId required."}), 401

    try:
        doc_ref = db.collection('transactions').document(transaction_id)
        doc = doc_ref.get()
        
        if not doc.exists:
             return jsonify({"error": "Transaction not found"}), 404
             
        if doc.to_dict().get('userId') != user_id:
             return jsonify({"error": "Unauthorized. Document belongs to another user."}), 403
             
        doc_ref.delete()
        return jsonify({"message": "Transacción eliminada exitosamente"}), 200
        
    except Exception as e:
        print(e)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Habilitar modo debug para que los cambios se recarguen solos
    app.run(debug=True, port=5000)
